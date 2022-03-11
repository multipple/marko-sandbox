
import Storage from 'all-localstorage'
import SharedState from 'markojs-shared-state'

function Instance( ___, $ ){
  
  const
  plugin = this,
  extensionId = $.nsi,

  Features = {
    // Localstorage support
    UIStore: new Storage({ prefix: extensionId, encrypt: true }),

    // Global state in-plugin support
    State: ( () => {
      const 
      ss = SharedState(),
      _state = ss

      _state.init = payload => ___.setState( payload )

      _state.bind = ss.bind
      _state.unbind = ( _, list ) => {
        stateKeys = stateKeys.filter( each => { return !each.includes( list ) } )
        ss.unbind( _, list )
      }
      _state.set = ( key, value ) => {
        !stateKeys.includes( key ) && stateKeys.push( key ) // Record new key
        ss.setState( key, value )
      }
      _state.get = ss.getState
      _state.dirty = ss.setStateDirty
      _state.define = ss.defineAPI
      
      return _state
    } )(),

    // API request handler
    Request: async ( url, options ) => {
      return new Promise( ( resolve, reject ) => {

        const 
        headers = { 'Content-Type': 'application/json' },
        body = JSON.stringify({
                                extensionId,
                                url,
                                /*
                                responseType: 'json',
                                body: {...},
                                authType: false,
                                */
                                ...options
                              })
                              
        fetch( '/extension/request', { method: 'POST', headers, body } )
            .then( response => {
              if( !response.ok )
                return reject({ code: response.status, message: response.statusText }) 
              
              try { return response.json() }
              catch( error ){ return response.text() }
            } )
            .then( resolve )
            .catch( reject )
      } )
    }
  },
  
  // List of states fields declared by in the plugins
  stateKeys = []
  
  // List of Features dependency assign to the plugin
  this.deps = []

  // Current environment mode in which the plugin is running
  this.env = window.env

  // Assign in-build plugin Features to the component: @params { Array | String }
  this.use = deps => {

    function assign( name ){
      
      if( !Features.hasOwnProperty( name ) ) return
      plugin[ name ] = Features[ name ]
      
      // Record dependency to be apply during `Plugin.extend()`
      if( !plugin.deps.includes( name ) ) plugin.deps.push( name )
    }

    Array.isArray( deps ) ? deps.map( assign ) : assign( deps )
    return this
  }

  // Extend plugin instance Features & Data to sub-components
  this.extend = ( component, deps ) => {
    // Confer existing static data of the main plugin component to extend components
    component.Plugin = new Instance( component, $ )
    // Assign requested app Features to the component
    component.Plugin.use([ ...this.deps, ...(deps || []) ])
    // Assign main app data
    component.Plugin.data = ___.Plugin.data

    // Automatically bind plugins's global state to this extended component
    this.deps.includes('State') 
    && ___.Plugin.State.bind( component, stateKeys )

    // Overwride method & properties that execute only on the main component
    component.Plugin.Features = Features
    component.Plugin.extend = this.extend
    component.Plugin.getConfig = this.getConfig
    component.Plugin.setConfig = this.setConfig
    component.Plugin.getPlugin = this.getPlugin

    /** Overwride debug method to be
     * able to trace directly to this 
     * component
     */
    component.Plugin.debug = ( message, status ) => this.debug( message, status, component )

    return this
  }
  
  // Return active configuration of the plugin
  this.getConfig = type => {
    // Plugin integrated to a core app/plugin
    if( $.input.core ){
      const dataset = $.input.core.getPlugin( extensionId )
      return dataset && dataset.configs && dataset.configs[ type ] || {}
    }
    
    // Standalone plugin
    return ___.input.meta.configs && ___.input.meta.configs[ type ] 
  }

  // Set & Update an installed plugin configuration
  this.setConfig = async ( payload, pluginNSI ) => {

    return $.input.core ?
              // Plugin integrated into a core app/plugin
              await $.input.core.setConfig( payload, extensionId )
              // Standalone plugin
              : await Features.Request(`/extension/${extensionId}/configure${pluginNSI ? '?plugin='+ pluginNSI : ''}`, { method: 'POST', body: payload })
  }

  // Return configuration of a given plugin embedded in this plugin
  this.getPlugin = nsi => { return ___.input.meta.plugins && ___.input.meta.plugins[ nsi ] }

  // Forward plugin `event` to Extension component handler
  this.emit = ( ...args ) => $.Emit( ...args )

  // Emit signal to Quit/Close plugin
  this.quit = () => $.Quit()

  // Debug mode logs
  this.debug = ( message, status, component ) => {
    const
    { name, version } = $.input,
    trace = ( component || ___ ).___type.replace( new RegExp(`\/${name}\\$(([0-9]+)\.)+`, 'i'), '')

    $.Debug( message, status, trace )
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