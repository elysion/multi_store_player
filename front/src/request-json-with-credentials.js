const backendHref = `http://${document.location.hostname}:4000`

const requestJSONwithCredentials = ({url, path, method = 'GET', body}) =>
  fetch(url ? url : `${backendHref}${path}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  })

export default requestJSONwithCredentials
