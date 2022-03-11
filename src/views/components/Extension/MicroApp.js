
import Storage from 'all-localstorage'
import SharedState from 'markojs-shared-state'

function Instance( ___, $ ){
  
  const
  app = this,
  extensionId = $.nsi,

  Features = {
    // Localstorage support
    UIStore: new Storage({ prefix: extensionId, encrypt: true }),

    // Global state in-app support
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
      return await $.Request({
                              extensionId,
                              url,
                              /*
                              responseType: 'json',
                              body: {...},
                              authType: false,
                              */
                              ...options 
                            })
    },
    
    Permission: {

      getScope: () => { return ( app.getConfig('permissions') || {} ).scope || [] },

      setScope: list => {
        if( !Array.isArray( list ) || !list.length ) return
        
        !___.input.meta.permissions ?
                      ___.input.meta.permissions = { scope: list } // New permission
                      : ___.input.meta.permissions.scope = list // Update permission scope
      },
      
      ask: ( type, scope ) => {
        // Manually ask permission scope and wait for granted list
        return new Promise( resolve => GState.permission.ask( type, ___.input.meta, scope, resolve ) )
      },

      mandatory: async ( mandatoryTypes, list, crossCheck ) => {
        /* Check for none granted mandatory permissions 
          and re-ask for those to be granted.
        */
        list = list || Features.Permission.getScope()
        
        let mandatoryScope = []
    
        list.map( ({ type, access }) => {
          if( mandatoryTypes.includes( type ) && access !== 'GRANTED' )
            mandatoryScope.push({ type, access })
        } )

        // All granted
        if( !mandatoryScope.length ) return true
        // All denied or cancelled
        if( crossCheck ) return false
    
        const grantedList = await Features.Permission.ask( 'scope', mandatoryScope )
        if( !Array.isArray( grantedList ) || !grantedList.length ) 
          return false // denied
        
        // Cross-check whether they are granted: Otherwise close app
        const response = await Features.Permission.mandatory( mandatoryTypes, grantedList, true )
        if( response === true ){
          // All mandatories are now granted
          grantedList.map( granted => {
            Features.Permission.setScope( list.map( each => {
              if( each.type == granted.type ) each.access = granted.access
              return each
            } ) )
          } )
          
          // Submit changes
          await app.setConfig({ type: 'permissions', configs: app.getConfig('permissions') })
          // Refresh extension display with the new config udpate
          app.refresh()

          return true
        }
    
        // Mandatory permissions denied
        return false
      }
    },

    Notification: {

      show: message => {
        const 
        { name, favicon } = ___.input.meta,
        payload = {
          icon: favicon,
          title: name,
          message
        }

        GState.notification.new( appId, payload )
      },

      bell: () => Features.Notification.show('')
    }
  },
  
  // List of states fields declared by in the apps
  stateKeys = []
  
  // List of Features dependency assign to the app
  this.deps = []

  // Current environment mode in which the app is running
  this.env = window.env

  // Assign in-build app Features to the component: @params { Array | String }
  this.use = deps => {

    function assign( name ){
      
      if( !Features.hasOwnProperty( name ) ) return
      app[ name ] = Features[ name ]
      
      // Record dependency to be apply during `App.extend()`
      if( !app.deps.includes( name ) ) app.deps.push( name )
    }

    Array.isArray( deps ) ? deps.map( assign ) : assign( deps )
    return this
  }

  // Extend app instance Features & Data to sub-components
  this.extend = ( component, deps ) => {
    // Confer existing static data of the main app component to extend components
    component.App = new Instance( component, $ )
    // Assign requested app Features to the component
    component.App.use([ ...this.deps, ...(deps || []) ])
    // Assign main app data
    component.App.data = ___.App.data

    // Automatically bind apps's global state to this extended component
    this.deps.includes('State')
    && component.App.State.bind( component, stateKeys )

    // Overwride method & properties that execute only on the main component
    component.App.Features = Features
    component.App.extend = this.extend
    component.App.getConfig = this.getConfig
    component.App.setConfig = this.setConfig
    component.App.getPlugin = this.getPlugin

    /** Overwride debug method to be
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
    const response = await Features.Request(`/extension/${extensionId}/configure${pluginNSI ? '?plugin='+ pluginNSI : ''}`, 
                                            { method: 'POST', body: payload })

    $.Refresh()
    return response
  }

  // Return configuration of a given plugin used in the app
  this.getPlugin = nsi => { return ___.input.meta.plugins && ___.input.meta.plugins[ nsi ] }

  // Forward app `event` to Extension wrapper's component
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

    const
    { name, version } = $.input,
    trace = ( component || ___ ).___type.replace( new RegExp(`\/${name}\\$(([0-9]+)\.)+`, 'i'), '')

    $.Debug( message, data, status, trace )
  }

  // App listening to core system signals
  this.signal = listener => {
    if( typeof listener !== 'function' )
      throw new Error('Expect signal <function> listener. Got '+ typeof listener )

    GState.on( 'extension:signal', ({ appId, code }) => appId == extensionId && listener( code ) )
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