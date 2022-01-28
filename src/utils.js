

import jQuery from 'jquery'
import SS from 'markojs-shared-state'
import Storage from 'all-localstorage'

window.$ = 
window.jQuery = jQuery,
window.uiStore = new Storage({ prefix: 'studio', encrypt: true })
window.debugLog = ( ...args ) => {
  if( window.env == 'production' ) return
  console.log( ...args )
}

/*--------------------------------------------------------------------------*/
// Add to shared-state library an easy DX API
const 
shareState = SS(),
GState = shareState
GState.bind = shareState.bind
GState.unbind = shareState.unbind
GState.get = shareState.getState
GState.set = shareState.setState
GState.dirty = shareState.setStateDirty
GState.define = shareState.defineAPI

window.GState = GState


window.isEmpty = entry => {
  // Test empty array or object
  if( typeof entry !== 'object' ) return null

  return Array.isArray( entry ) ?
              !entry.length
              : Object[ Object.entries ? 'entries' : 'keys' ]( entry ).length === 0 && entry.constructor === Object
}

window.newObject = obj => { return typeof obj == 'object' && JSON.parse( JSON.stringify( obj ) ) }