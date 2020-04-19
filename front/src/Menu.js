import React, { Component } from 'react'
import SessionLogin from './SessionLogin.js'
import CookieLogin from './CookieLogin.js'
import RefreshButton from './RefreshButton'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials.js'
import BPromise from 'bluebird'
import './Menu.css'

export default class Menu extends Component {
  constructor(props) {
    super(props)

    this.state = {
      validSessions: new Set()
    }
  }

  updateLogins() {
    return BPromise.each(['beatport', 'bandcamp'],
      store =>
        requestJSONwithCredentials({ path: `/stores/${store}/session/` })
          .catch(e => ({ valid: false }))
          .then(({ valid }) => {
            const newValidSessions = new Set(this.state.validSessions)
            newValidSessions[valid ? 'add' : 'delete'](store)

            if (valid) {
              this.props.onStoreLoginDone(store)
            }

            return this.setState({
              validSessions: newValidSessions
            })
          })
    )
  }

  logout = async () => {
    try {
      await BPromise.each(['beatport', 'bandcamp'],
        store => requestWithCredentials({ path: `/stores/${store}/logout/`, method: 'POST' }))

      await requestWithCredentials({ path: '/logout', method: 'POST' })
    } catch (e) {
      console.error('Logout failed', e)
    }
    this.props.onLogoutDone()
  }

  componentDidMount() {
    this.updateLogins()
  }

  render() {
    return <div id="menu" className={"menu-container"}>
      <div className={"menu-stores"}>
        <h2>Player</h2>
        <button
          className={`button menu-item button-push_button-small button-push_button-primary`}
          onClick={this.logout}>
          Logout
        </button>
        <h2>Stores</h2>
        {
          <ul className={'store-list'}>
            <li className={"store-list-item"} key={"beatport"}>
              <h3>Beatport</h3>
              <SessionLogin
                loginPath={"/stores/beatport/login"}
                logoutPath={"/stores/beatport/logout"}
                size={"small"}
                loginName={"beatport"}
                sessionProperties={{
                  csrfToken: 'CSRF Token',
                  sessionCookieValue: 'Session'
                }}
                onLoginDone={this.updateLogins.bind(this)}
                onLogoutDone={this.updateLogins.bind(this)}
                loggedIn={this.state.validSessions.has('beatport')}
                loggedInContent={
                  <RefreshButton store={'beatport'}
                    onUpdateTracks={this.props.onUpdateTracks}
                  />
                }
              />
            </li>
            <li className={"store-list-item"} key={"bandcamp"}>
              <h3>Bandcamp</h3>
              <CookieLogin
                loginPath={"/stores/bandcamp/login"}
                logoutPath={"/stores/bandcamp/logout"}
                size={"small"}
                loggedIn={this.state.validSessions.has('bandcamp')}
                onLoginDone={this.updateLogins.bind(this)}
                onLogoutDone={this.updateLogins.bind(this)}
                loggedInContent={
                  <RefreshButton store={'bandcamp'}
                    onUpdateTracks={this.props.onUpdateTracks}
                  />
                }
              />
            </li>
          </ul>
        }
      </div>
    </div>
  }
}
