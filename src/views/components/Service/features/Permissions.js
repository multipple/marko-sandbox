
export default ( app, context, state ) => {

  const api = {
    getScope: () => { return ( app.getConfig('permissions') || {} ).scope || [] },

    setScope: list => {
      if( !Array.isArray( list ) || !list.length ) return
      
      !context.input.meta.permissions ?
                    context.input.meta.permissions = { scope: list } // New permission
                    : context.input.meta.permissions.scope = list // Update permission scope
    },
    
    ask: ( type, scope ) => {
      // Manually ask permission scope and wait for granted list
      return new Promise( resolve => state && state.permission.ask( type, context.input.meta, scope, resolve ) )
    },

    mandatory: async ( mandatoryTypes, list, crossCheck ) => {
      /* Check for none granted mandatory permissions 
        and re-ask for those to be granted.
      */
      list = list || api.getScope()
      
      let mandatoryScope = []
  
      list.map( ({ type, access }) => {
        if( mandatoryTypes.includes( type ) && access !== 'GRANTED' )
          mandatoryScope.push({ type, access })
      } )

      // All granted
      if( !mandatoryScope.length ) return true
      // All denied or cancelled
      if( crossCheck ) return false
  
      const grantedList = await api.ask( 'scope', mandatoryScope )
      if( !Array.isArray( grantedList ) || !grantedList.length ) 
        return false // denied
      
      // Cross-check whether they are granted: Otherwise close app
      const response = await api.mandatory( mandatoryTypes, grantedList, true )
      if( response === true ){
        // All mandatories are now granted
        grantedList.map( granted => {
          api.setScope( list.map( each => {
            if( each.type == granted.type ) each.access = granted.access
            return each
          } ) )
        } )
        
        // Submit changes
        await app.setConfig({ type: 'permissions', configs: app.getConfig('permissions') })
        // Refresh service display with the new config udpate
        app.refresh()

        return true
      }
  
      // Mandatory permissions denied
      return false
    }
  }

  return api
}