import React, {Component} from 'react'
import Login from './Login.js'
import requestJSONwithCredentials from './request-json-with-credentials.js'
import BPromise from 'bluebird'

// TODO: merge with App.js
const getJsonFromResults = results => {
  if (results.ok) {
    return results.json()
  } else {
    throw new Error('Request failed')
  }
}

export default class Menu extends Component {
  constructor(props) {
    super(props)

    this.state = {
      validSessions: new Set()
    }
  }

  updateLogins() {
    return BPromise.each(['beatport'],
      store =>
        requestJSONwithCredentials({ path: `/store/${store}/session-valid` })
          .then(getJsonFromResults)
          .catch(e => ({ validSession: false }))
          .then(({ validSession }) => {
            const newValidSessions = new Set(this.state.validSessions)
            newValidSessions[validSession ? 'add' : 'delete'](store)

            if (validSession) {
              this.props.onLoginDone(store)
            }

            return this.setState({
              validSessions: newValidSessions
            })
          })
    )
  }

  componentDidMount() {
    this.updateLogins()
  }

  render() {
    return <div id="menu" className={"menu-container"}>
      <div className={"menu-stores"}>
        <h2>Stores</h2>
        {
          this.state.loading ?
            <div>Loading...</div>
            :
            <div>
              Beatport<br/>
              {
                this.state.validSessions.has('beatport') ?
                  <button
                    disabled={this.state.loggingOut}
                    className={'button login-button button-push_button-small button-push_button-primary'}
                    onClick={() =>
                      requestJSONwithCredentials({
                        path: '/store/beatport/logout',
                        method: 'POST'
                      })
                        .then(() => this.updateLogins())}>
                    Logout
                  </button> :
                  <Login
                    loginPath={"/store/beatport/login"}
                    size={"small"}
                    onLoginDone={() => {
                      this.setState({ loggedIn: true })
                      this.updateLogins()
                      requestJSONwithCredentials({
                        path: `/store/beatport/refresh`,
                        method: 'POST'
                      })
                    }}
                  />
              }
            </div>
        }
      </div>
    </div>
  }
}
