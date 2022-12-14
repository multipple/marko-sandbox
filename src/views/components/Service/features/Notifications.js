
export default ( appId, context, state ) => {

  const api = {
    show: message => {
      const 
      { name, favicon } = context.input.meta,
      payload = {
        icon: favicon,
        title: name,
        message
      }

      state && state.notification.new( appId, payload )
    },

    bell: () => api.show('')
  }

  return api
}