

import jQuery from 'jquery'
import moment from 'moment'
import TraceKit from 'tracekit'
import SS from 'markojs-shared-state'
import Storage from 'all-localstorage'

String.prototype.toCapitalCase = function(){
  // Fonction de capitalisation du premier caractère d'un mot
  this.toLowerCase()

  const
  First = this.charAt(0),
  regex = new RegExp('^'+ First )

  return First.toUpperCase() + this.split( regex )[1]
}

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

/*--------------------------------------------------------------------------*/
// Report error trace
window.GTrace = {}
TraceKit.remoteFetching = false
window.GTrace.listen = fn => {

  TraceKit.report.subscribe( error => {
    const relevants = []

    for( let x in error.stack ){
      const { line, column, func, url } = error.stack[ x ]
      let filename = url.split('/').pop()

      if( filename.includes('client.js') )
        break

      const 
      comp = filename.replace('.chunk.js', '').split('_'),
      service = comp.pop()
      
      relevants.push({ line, column, func, path: `${comp.join('/')}.${service}` })
    }

    error.stack = relevants
    typeof fn == 'function' && fn( error )
  } )
}
window.GTrace.dispose = TraceKit.report.unsubscribe
window.GTrace.throw = TraceKit.report

/*--------------------------------------------------------------------------*/
// Global methods

window.isEmpty = entry => {
  // Test empty array or object
  if( typeof entry !== 'object' ) return null

  return Array.isArray( entry ) ?
              !entry.length
              : Object[ Object.entries ? 'entries' : 'keys' ]( entry ).length === 0 && entry.constructor === Object
}

window.newObject = obj => { return typeof obj == 'object' && JSON.parse( JSON.stringify( obj ) ) }

window.corsProxy = ( url, type ) => {
  // Ignore wrapping same origin URL
  return `https://web.getlearncloud.com/proxy?url=${encodeURIComponent( url )}&responseType=${type || 'blob'}` 
}

window.random = ( min, max ) => {
  // generate random number at a range
  return Math.floor( Math.random() * ( max - min + 1 )+( min + 1 ) )
}

window.formatDate = ( date, format ) => {

  const _date = date == 'now' ? moment() : moment( date )

  if( format == 'calendar' ) return _date.calendar()

  return _date.format( format )
}
