import { desktopCapturer, session } from 'electron'

/**
 * Lets the renderer capture the microphone and the system audio.
 *
 * System audio comes from getDisplayMedia(): Electron hands back the primary
 * screen together with a WASAPI loopback of everything the speakers play.
 * The renderer keeps only the audio track.
 */
export function registerCapture(): void {
  const ses = session.defaultSession

  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture')
  })
  ses.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media' || permission === 'display-capture'
  })

  ses.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({ types: ['screen'] })
      if (sources.length === 0) {
        callback({})
        return
      }
      callback({ video: sources[0], audio: 'loopback' })
    },
    { useSystemPicker: false }
  )
}
