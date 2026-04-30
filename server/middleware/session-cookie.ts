import { getCookie } from 'h3'

export default defineEventHandler((event) => {
  // skip middleware on client side entirely
  if (import.meta.client) {
    return
  }
  
  // Get sessionId from cookie
  const sessionId = getCookie(event, 'sessionId')
  event.context.sessionId = sessionId;

})
