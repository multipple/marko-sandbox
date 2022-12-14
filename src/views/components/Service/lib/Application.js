
import EState from '../features/EState'
import CloudDB from '../features/cloud.db-client'
import UIStore from '../features/UIStore'
import APIRequest from '../features/APIRequest'
import Permissions from '../features/Permissions'
import Notifications from '../features/Notifications'

function Features( ___, $, app, sid ){
  
  return {
    // Global state in-app support
    State: new EState( ___ ),
    // Localstorage support
    UIStore: UIStore( sid ),
    // API request handler
    Request: APIRequest( sid, $ ),
    // App/Plugin permissions Manager
    Permission: Permissions( app, ___, GState ),
    // App/Plugin Notification Manager
    Notification: Notifications( sid, ___, GState ),
    // Cloud based DB support
    DB: CloudDB( 'http://marketplace.multipple.com:5119', '1.0', 'MP.WEB/2.0', sid ),
    // Translate string text to locale language using function method
    String: text => { return $.RenderLocale( text ) }
  }
}

function Instance( ___, $, clone ){
  
  const
  app = this,
  sid = $.sid
  
  // Initialize features
  if( !clone )
    this.features = Features( ___, $, app, sid )

  // List of Features dependency assign to the app
  this.deps = []

  // Current environment mode in which the app is running
  this.env = window.env

  // Assign in-build app Features to the component: @params { Array | String }
  this.use = deps => {
    const features = clone ? ___.App.features : this.features
    
    function assign( name ){
      if( !features.hasOwnProperty( name ) ) return
      app[ name ] = features[ name ]
      
      // Record dependency to be apply during `App.extend()`
      if( !app.deps.includes( name ) ) app.deps.push( name )
    }

    Array.isArray( deps ) ? deps.map( assign ) : assign( deps )
    return this
  }

  // Extend app instance Features & Data to sub-components
  this.extend = ( component, deps ) => {
    // Confer existing static data of the main app component to extend components
    component.App = new Instance( component, $, true )
    // Assign root features
    component.App.features = this.features
    // Assign main app data
    component.App.data = this.data
    // Assign requested app Features to the component
    component.App.use([ ...this.deps, ...(deps || []) ])
    
    // Automatically bind apps's global state to this extended component
    component.App.deps.includes('State')
    && component.App.State.share( component )

    // Overwride method & properties that execute only on the main component
    component.App.extend = this.extend
    component.App.getConfig = this.getConfig
    component.App.setConfig = this.setConfig
    component.App.getPlugin = this.getPlugin

    /** Overwride debug methods to be
     * able to trace directly to this 
     * component
     */
    component.App.debug = ( message, data, status ) => this.debug( message, data, status, component )

    return this
  }

  // Return active configuration of the app
  this.getConfig = type => { return ___.input.meta.configs && ___.input.meta.configs[ type ] }

  // Set & Update an installed app configuration
  this.setConfig = async ( payload, pluginNSI ) => {
    
    const 
    features = clone ? ___.App.features : this.features,
    response = await features.Request(`/service/${sid}/configure${pluginNSI ? '?plugin='+ pluginNSI : ''}`, 
                                      { method: 'POST', body: payload })

    $.Refresh()
    return response
  }

  // Return configuration of a given plugin used in the app
  this.getPlugin = nsi => { return ___.input.meta.plugins && ___.input.meta.plugins[ nsi ] }

  // Forward app `event` to Service wrapper's component
  this.emit = ( ...args ) => $.Emit( ...args )

  // Quit/Close app
  this.quit = () => $.Quit()
  
  // Emit signal to refresh app configs & component
  this.refresh = () => $.Refresh()

  // Debug mode logs
  this.debug = ( message, data, status, component ) => {
    if( !message ) return

    if( typeof status !== 'string' ){
      status = 'log'
      
      if( ['warning', 'info', 'success', 'danger'].includes( data ) ){
        status = data
        data = undefined
      }
    }

    const trace = ( component || ___ ).___type.replace( new RegExp(`\/${$.input.name}\\$(([0-9]+)\.)+`, 'i'), '')
    $.Debug( message, data, status, trace )
  }

  // App listening to core system signals
  this.signal = listener => {
    if( typeof listener !== 'function' )
      throw new Error('Expect signal <function> listener. Got '+ typeof listener )

    GState.on( 'service:signal', ({ appId, code }) => appId == sid && listener( code ) )
  }

  // Pass static data to the app that can be share with any sub-component that extend it
  this.data = {}
}

export function Manager( wrapper ){
  
	this.bind = ( component, deps ) => {
		// Turning the regular component into a Micro-App
		this.component = component
		this.component.App = new Instance( component, wrapper )
    
    // Assign requested app Features to the component
    this.component.App.use( deps )
    
    // // Extend app from the main component to child components having `key="app-extend"`
    // const extendChildren = this.component.getComponents('app-extend')
    // extendChildren.length && extendChildren.map( each => this.component.App.extend( each ) )
    
		// Auto unbind when component get destroy
		component.on( 'destroy', () => this.unbind() )
	}

  // Unbind the micro-app from the component
  this.unbind = () => delete this.component.App

}