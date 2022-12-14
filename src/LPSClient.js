
function Obj2Params( obj, excludes ){
  return typeof obj == 'object' ?
            Object.entries( obj )
                  .map( ([ key, value ]) => {
                    if( !Array.isArray( excludes ) || !excludes.includes( key ) )
                      return `${key }=${ value}`
                  }).join('&') : ''
}

function Request( api, method, data ){
  return new Promise( ( resolve, reject ) => {
    const options = {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'lps-user-agent': 'LPS/RM',
        'lps-client-id': 'OPAC-12-09HH--$0'
      }
    }

    if( data ) options.body = JSON.stringify( data )

    window
    .fetch(`/lpstore${ api !== '/' ? api : ''}`, options )
    .then( res => { return !res.ok ? reject( res.status ) : res.json() } )
    .then( resolve )
    .catch( reject )
  } )
}

// Store new item (metadata)
export const set = async metadata => {
  try {
    const { error, message, result } = await Request('/', 'POST', metadata )
    if( error ) throw new Error( message )

    return result
  }
  catch( error ) {
    console.log('Failed setting item(s) to the store: ', error )
    return null
  }
}
// Get an items details
export const get = async query => {
  try {
    /** ---------- Sandbox mode ----------**/
    // If( window.SANDBOX ) return require('root/../.metadata')

    /** ---------- Regular mode ----------**/
    const { error, message, result } = await Request(`${query ? `?${ Obj2Params( query )}` : '/'}`)
    if( error ) throw new Error( message )

    return result
  }
  catch( error ) {
    console.log('Failed Retreiving from the store: ', error )
    return null
  }
}
// Fetch items by query
export const fetch = async query => {
  try {
    const { error, message, result } = await Request(`/fetch${query ? `?${ Obj2Params( query )}` : ''}`)
    if( error ) throw new Error( message )

    return result
  }
  catch( error ) {
    console.log('Failed Fetching items from the store: ', error )
    return []
  }
}
// Update item (metadata)
export const update = async ( sid, updates ) => {
  try {
    const { error, message, result } = await Request('/', 'PATCH', { sid, updates })
    if( error ) throw new Error( message )

    return result
  }
  catch( error ) {
    console.log('Failed Updating the store: ', error )
    return null
  }
}
// Delete item from store
export const remove = async sid => {
  try {
    const { error, message, result } = await Request(`?sid=${sid}`, 'DELETE')
    if( error ) throw new Error( message )

    return result
  }
  catch( error ) {
    console.log('Failed Updating the store: ', error )
    return null
  }
}

export default { set, get, fetch, update, remove }