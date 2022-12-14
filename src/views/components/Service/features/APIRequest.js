
export default ( sid, service ) => {
  return async ( url, options ) => {
    return await service.Request({ sid, url, ...options })
  }
}