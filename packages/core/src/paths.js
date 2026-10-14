/**
 * 默认读取站点上的 /h265web/。把 assets/h265web 放到这个路径即可。
 * @param {string} [assetBase]
 */
export function resolveAssetPaths(assetBase = '/h265web/') {
  const root = `${assetBase}`.replace(/\/+$/, '') + '/'
  return {
    root,
    sdkDir: `${root}output/`,
    remoteWorker: `${root}ps-remote-seek-worker.js`,
  }
}
