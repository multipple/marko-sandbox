
import SharedState from 'markojs-shared-state'

export default function EState( context ){

  const ss = SharedState()
  let stateKeys = []
  
  this.init = payload => {
    if( !context || typeof payload !== 'object' ) return

    context.setState( payload )
    Object.entries( payload )
          .map( ([ key, value ]) => this.set( key, value ) )
  }
  
  this.share = ( component, keys ) => {
    if( !component.state ) component.state = {} // Create default component state which to bind to
    ss.bind( component, keys || stateKeys )
  }
  this.unshare = ( _, list ) => {
    stateKeys = stateKeys.filter( each => { return !each.includes( list ) } )
    ss.unbind( _, list )
  }
  this.set = ( key, value ) => {
    !stateKeys.includes( key ) && stateKeys.push( key ) // Record new key
    ss.setState( key, value )
  }
  this.get = key => ss.getState( key )
  this.dirty = key => ss.setStateDirty( key )
  this.define = key => {
    const api = ss.defineAPI( key )
    this[ key ] = ss[ key ]
    return api
  }
  this.on = ( _event, fn ) => ss.on( _event, fn )
  this.off = ( _event, fn ) => ss.off( _event, fn )
  this.once = ( _event, fn ) => {
    return ss.on( _event, value => {
      fn( value )
      ss.off( _event )
    } )
  }
}