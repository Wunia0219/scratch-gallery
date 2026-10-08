import { loadEnv } from 'vite'
import { readFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { buildAssetManifest } from './lib/game-assets.mjs'
import { getFirebaseServices } from '../netlify/lib/firebase-runtime.mjs'
import { editableWork, validateWork, publicWork, WORK_ID } from '../src/lib/workSchema.js'
import { mutateWork } from '../netlify/lib/work-service.mjs'
import { saveCatalogBackup } from './lib/private-backup.mjs'

Object.assign(process.env, loadEnv('development', process.cwd(), ''))
const args = process.argv.slice(2), option = key => args[args.indexOf(key) + 1]
if (args.some(arg => !['--apply', '--local', '--origin', '--deploy-id', '--id', '--publish'].includes(arg) && !args.some((key, index) => ['--origin', '--deploy-id', '--id', '--publish'].includes(key) && args[index + 1] === arg))) throw new Error('未知參數')
const manifest = await buildAssetManifest(), { store, auth, projectId } = await getFirebaseServices()
const testEnvironment = process.env.FIREBASE_ENVIRONMENT === 'test' && projectId !== 'scratch-gallery-c0e33'
const owner = await auth.getUserByEmail('nini900219@gmail.com')
if (!owner.emailVerified || owner.disabled || !(await store.get(`admins/${owner.uid}`))?.enabled || (await store.get(`admins/${owner.uid}`))?.role !== 'owner') throw new Error('站主管理權限不存在')
if (args.includes('--publish')) {
  const id = option('--publish')
  if (!WORK_ID.test(id) || !args.includes('--apply')) throw new Error('發布請使用 --publish <UUID> --apply')
  const [work, draft] = await Promise.all([store.get(`works/${id}`), store.get(`workDrafts/${id}`)])
  if (!work || !draft) throw new Error('請先在後台儲存作品草稿')
  const result = await mutateWork(store, owner.uid, { id, action: 'publish', operationId: randomUUID(), expectedRevision: work.revision, expectedDraftRevision: draft.revision, work: editableWork(draft) }, manifest, testEnvironment ? 'test' : args.includes('--local') ? 'local' : 'production')
  console.log(`已透過共用發布流程上架 ${id}；首次上架時間：${result.publishedAt ?? '沿用舊作品未知日期'}`)
} else {
  const local = args.includes('--local'), origin = local ? 'http://127.0.0.1:3000' : option('--origin')
  const registeredEnvironment = local ? testEnvironment ? 'test' : 'local' : 'production'
  if (!local && origin !== 'https://giraffegallery.com') throw new Error('正式資源登錄需使用 --origin https://giraffegallery.com --deploy-id <Netlify deploy ID>；本機驗證請使用 --local')
  if (local && process.env.CONTEXT) throw new Error('Netlify 環境不可登錄本機資源')
  const deployId = local ? `local-${manifest.manifestVersion}` : option('--deploy-id')
  if (!deployId || !/^[a-zA-Z0-9-]{1,100}$/.test(deployId)) throw new Error('部署代號不正確')
  const games = JSON.parse(await readFile('public/games.json', 'utf8')), creators = JSON.parse(await readFile('public/creators.json', 'utf8'))
  const id = args.includes('--id') ? option('--id') : null
  if (id && !manifest.works.some(asset => asset.id === id)) throw new Error('作品代號不存在')
  const assets = manifest.works.filter(asset => !id || asset.id === id)
  const snapshot = {}
  for (const collection of ['works', 'workDrafts', 'creators', 'publicWorks', 'workAssets']) snapshot[collection] = await store.list(collection)
  snapshot.settings = { public: await store.get('siteSettings/public'), catalog: await store.get('siteSettings/catalog') }
  console.log(`${args.includes('--apply') ? '將登錄' : '預演，不寫入'}：${projectId}，${local ? '本機資源' : '正式資源'}，${assets.length} 件；新增 ${assets.filter(asset => !snapshot.works.some(work => work.id === asset.id)).length} 件。既有介紹與首次上架日期保留。`)
  if (args.includes('--apply')) {
    if (local && (snapshot.settings.catalog?.productionAssetsRegistered || snapshot.workAssets.some(asset => asset.environment === 'production'))) throw new Error('此資料庫已登錄正式資源，不可再以 --local 覆寫；本機測試改用獨立專案')
    if (!local) {
      const response = await fetch(`${origin}/game-assets.json`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error('正式網站尚未部署新的資源清單')
      const remote = await response.json()
      if (remote.manifestVersion !== manifest.manifestVersion || JSON.stringify(remote.works) !== JSON.stringify(manifest.works)) throw new Error('正式網站資源清單與本機版本不一致')
      const files = [...new Map(assets.flatMap(asset => asset.resources).map(file => [file.path, file])).values()]
      for (let offset = 0; offset < files.length; offset += 4) await Promise.all(files.slice(offset, offset + 4).map(async file => {
        const result = await fetch(new URL(file.path, origin), { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) })
        if (!result.ok || createHash('sha256').update(Buffer.from(await result.arrayBuffer())).digest('hex') !== file.sha256) throw new Error(`部署檔案驗證失敗：${file.path}`)
      }))
      console.log(`正式網站 ${files.length} 個檔案雜湊核對完成。`)
    }
    const backup = await saveCatalogBackup({ projectId, createdAt: new Date().toISOString(), ...snapshot })
    const now = new Date().toISOString()
    for (const asset of assets) {
      const source = games.find(game => game.id === asset.id), creatorSource = creators.find(creator => creator.id === source.creatorId)
      await store.transaction(async tx => {
        const [current, creator, settings, stats, oldAsset] = await Promise.all([tx.get(`works/${asset.id}`), tx.get(`creators/${source.creatorId}`), tx.get('siteSettings/public'), tx.get('siteSettings/catalog'), tx.get(`workAssets/${asset.id}`)])
        if (!settings) throw new Error('請先完成第一步 Firebase 初始化')
        const sourceAuthor = creator ?? creatorSource
        const author = current && current.creatorId !== source.creatorId ? await tx.get(`creators/${current.creatorId}`) : sourceAuthor
        if (!author) throw new Error('既有作者不存在')
        const candidate = validateWork(editableWork({ ...source, sortOrder: 0 }), asset, sourceAuthor)
        const work = current ?? { ...candidate, status: source.releasePending ? 'draft' : 'published', hasPublished: !source.releasePending, publishedAt: source.publishedAt ?? null, revision: 1, sourceOrder: asset.sourceOrder, createdAt: now, updatedAt: now }
        const nextStats = { counts: { student: 0, teacher: 0 }, classCounts: {}, ...stats, ...(!local ? { productionAssetsRegistered: true } : {}), revision: (stats?.revision ?? 0) + 1, updatedAt: now }
        if (!current && work.status === 'published') { nextStats.counts[author.role]++; if (author.role === 'student') nextStats.classCounts[author.className] = (nextStats.classCounts[author.className] || 0) + 1 }
        if (!creator) tx.set(`creators/${sourceAuthor.id}`, sourceAuthor)
        if (!current) { tx.set(`works/${work.id}`, work); if (work.status === 'draft') tx.set(`workDrafts/${work.id}`, { ...candidate, baseRevision: 1, revision: 1, updatedAt: now, updatedBy: owner.uid }) }
        // Resource updates preserve all editor changes and the original publication date.
        const unchangedAsset = oldAsset?.assetVersion === asset.assetVersion && oldAsset?.environment === registeredEnvironment
        tx.set(`workAssets/${asset.id}`, { id: asset.id, assetVersion: asset.assetVersion, manifestVersion: manifest.manifestVersion, deployId, origin, environment: registeredEnvironment, verifiedAt: now, assetsDeployedAt: unchangedAsset ? oldAsset.assetsDeployedAt : now })
        if (work.status === 'published') {
          const content = editableWork(work)
          if (!asset.thumbnails.includes(content.thumbnail)) throw new Error('既有封面已移除，請保留檔案或先於後台調整')
          tx.set(`publicWorks/${work.id}`, publicWork(work, asset, author))
        }
        tx.set('siteSettings/catalog', nextStats)
        tx.set('siteSettings/public', { ...settings, catalogRevision: nextStats.revision, revision: (settings.revision ?? 0) + 1, updatedAt: now })
        tx.set(`auditLogs/assets-${randomUUID()}`, { action: 'assets-register', targetId: asset.id, actorUid: owner.uid, createdAt: now, deployId, environment: registeredEnvironment })
      })
    }
    console.log(`登錄完成；備份：${backup}。新增待發布作品仍為草稿。`)
  }
}
