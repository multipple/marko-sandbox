
import Storage from 'all-localstorage'
import SharedState from 'markojs-shared-state'

function Instance( ___, $ ){
  
  const
  plugin = this,
  extensionId = $.uid,

  Features = {

    UIStore: new Storage({ prefix: extensionId, encrypt: true }),

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
    component.Plugin = ___.Plugin
    // Assign additional required features
    deps && ___.Plugin.use( deps )
    // Automatically bind plugins's global state to this extended component
    this.deps 
    && this.deps.includes('State') 
    && ___.Plugin.State.bind( component, stateKeys )

    return this
  }
  // Return active configuration of the plugin
  this.getConfig = type => { return ___.input.meta.configs[ type ] }

  // Set & Update an installed plugin configuration
  this.setConfig = async payload => {
    return await Features.Request(`/extension/${extensionId}/configure`, { method: 'POST', body: payload })
  }

  // Return configuration of a given plugin embedded in this plugin
  this.getPlugin = type => { return ___.input.meta.plugins && ___.input.meta.plugins[ type ] }

  // Forward plugin `event` to Extension component handler
  this.emit = ( ...args ) => $.onEmit( ...args )

  // Emit signal to Quit/Close plugin
  this.quit = () => $.quit()

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