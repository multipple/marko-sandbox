
import EState from '../features/EState'
import UIStore from '../features/UIStore'
import APIRequest from '../features/APIRequest'

function Features( ___, $, plugin, sid ){
  
  return {
    // Global state in-plugin support
    State: new EState( ___ ),
    // Localstorage support
    UIStore: UIStore( sid ),
    // API request handler
    Request: APIRequest( sid, $ ),
    // Translate string text to locale language using function method
    String: text => { return $.RenderLocale( text ) }
  }
}

function Instance( ___, $, clone ){
  
  const
  plugin = this,
  sid = $.sid
  
  // Initialize features
  if( !clone )
    this.features = Features( ___, $, plugin, sid )
  
  // List of Features dependency assign to the plugin
  this.deps = []

  // Current environment mode in which the plugin is running
  this.env = window.env

  // Assign in-build plugin Features to the component: @params { Array | String }
  this.use = deps => {
    const features = clone ? ___.Plugin.features : this.features
    
    function assign( name ){
      if( !features.hasOwnProperty( name ) ) return
      plugin[ name ] = features[ name ]
      
      // Record dependency to be apply during `Plugin.extend()`
      if( !plugin.deps.includes( name ) ) plugin.deps.push( name )
    }

    Array.isArray( deps ) ? deps.map( assign ) : assign( deps )
    return this
  }

  // Extend plugin instance Features & Data to sub-components
  this.extend = ( component, deps ) => {
    // Confer existing static data of the main plugin component to extend components
    component.Plugin = new Instance( component, $, true )
    // Assign root features
    component.Plugin.features = this.features
    // Assign main plugin data
    component.Plugin.data = this.data
    // Assign requested plugin Features to the component
    component.Plugin.use([ ...this.deps, ...(deps || []) ])
    
    // Automatically bind plugin's global state to this extended component
    component.Plugin.deps.includes('State')
    && component.Plugin.State.share( component )

    // Overwride method & properties that execute only on the main component
    component.Plugin.extend = this.extend
    component.Plugin.getConfig = this.getConfig
    component.Plugin.setConfig = this.setConfig
    component.Plugin.getPlugin = this.getPlugin

    /** Overwride debug method to be
     * able to trace directly to this 
     * component
     */
    component.Plugin.debug = ( message, data, status ) => this.debug( message, data, status, component )

    return this
  }
  
  // Return active configuration of the plugin
  this.getConfig = type => {
    // Plugin integrated to a core app/plugin
    if( $.input.core ){
      const dataset = $.input.core.getPlugin( sid )
      return dataset && dataset.configs && dataset.configs[ type ] || {}
    }
    
    // Standalone plugin
    return ___.input.meta.configs && ___.input.meta.configs[ type ] 
  }

  // Set & Update an installed plugin configuration
  this.setConfig = async ( payload, pluginNSI ) => {

    // Plugin integrated into a core app/plugin
    if( $.input.core )
      return await $.input.core.setConfig( payload, sid )
    
    // Standalone plugin
    else {
      const features = clone ? ___.App.features : this.features
      return await features.Request(`/service/${sid}/configure${pluginNSI ? '?plugin='+ pluginNSI : ''}`, { method: 'POST', body: payload })
    }
  }

  // Return configuration of a given plugin embedded in this plugin
  this.getPlugin = nsi => { return ___.input.meta.plugins && ___.input.meta.plugins[ nsi ] }

  // Forward plugin `event` to Service component handler
  this.emit = ( ...args ) => $.Emit( ...args )

  // Emit signal to Quit/Close plugin
  this.quit = () => $.Quit()

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

  // Pass static data to the plugin that can be share with any sub-component that extend it
  this.data = {}
}

export function Manager( wrapper ){
  
	this.bind = ( component, deps ) => {
		// Turning the regular component into a Plugin
		this.component = component
		this.component.Plugin = new Instance( component, wrapper )
    
    // Assign requested plugin Features to the component
    this.component.Plugin.use( deps )
    
		// Auto unbind when component get destroy
		component.on( 'destroy', () => this.unbind() )
	}

  // Unbind the Plugin from the component
  this.unbind = () => delete this.component.Plugin

}