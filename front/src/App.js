import React, { Component } from 'react'
import * as R from 'ramda'

import Login from './UserLogin.js'
import Menu from './Menu.js'
import Player from './Player.js'
import './App.css'
import SlideoutPanel from './SlideoutPanel.js'

import { requestJSONwithCredentials } from './request-json-with-credentials.js'

// import injectTapEventPlugin from 'react-tap-event-plugin';
// injectTapEventPlugin();

const defaultTracksData = { tracks: [], meta: { totalTracks: 0, newTracks: 0 } }

class App extends Component {
  constructor(props) {
    super(props)
    this.state = {
      slideout: null,
      carts: {},
      loggedIn: false,
      tracksData: defaultTracksData
    }
  }

  async componentDidMount() {
    try {
      await this.updateTracks()
      this.setState({ loggedIn: true })
    } catch (e) {
      console.error(e)
      this.setState({ loggedIn: false })
    }
  }

  setCarts(store, carts) {
    this.setState(R.evolve({
      carts: R.assoc(store, carts)
    }))
  }

  updateCarts(store) {
    // return requestJSONwithCredentials({ path: `/stores/${store}/carts` })
    //   .then(getJsonFromResults)
    //   .then(carts => this.setCarts(store, carts))
  }

  async onLoginDone() {
    this.setState({ loggedIn: true })
    await this.updateTracks()
  }

  onLogoutDone() {
    this.setState({ loggedIn: false, tracksData: defaultTracksData })
  }

  async updateTracks() {
    const { meta: { 'new': newTracks, total: totalTracks }, tracks } =
      await requestJSONwithCredentials({
        path: `/tracks`
      })

    this.setState({ tracksData: { tracks: tracks.slice(0, 500), meta: { newTracks, totalTracks } } })
  }

  async onStoreLoginDone(store) {
    this.updateCarts(store)
  }

  async updateLogins() {

  }

  render() {
    return <div className="root" style={{ height: "100%", overflow: "hidden" }}>
      {this.state.loggedIn ?
        <>
          <Menu ref="menu"
            loggedIn={this.state.loggedIn}
            onLogoutDone={this.onLogoutDone.bind(this)}
            onStoreLoginDone={() => { }} //this.onStoreLoginDone.bind(this)}
            onUpdateTracks={this.updateTracks.bind(this)}
          ></Menu>
          <SlideoutPanel
            ref="slideout"
            onOpen={this.updateLogins.bind(this)}
          >
            <Player
              onMenuClicked={() => {
                this.refs['slideout'].toggle()
              }}
              carts={this.state.carts}
              tracks={this.state.tracksData.tracks}
              newTracks={this.state.tracksData.meta.newTracks}
              totalTracks={this.state.tracksData.meta.totalTracks}
              onAddToCart={(store => this.updateCarts(store))}
              onRemoveFromCart={(store => this.updateCarts(store))}
            ></Player>
          </SlideoutPanel>
        </>
        :
        <div className='align-center-container' style={{ height: '100%' }}>
          <div style={{
            width: '50%',
            borderRadius: 10,
            padding: 20,
            boxShadow: 'rgba(0, 0, 0, 0.27) 2px 2px 40px 0px',
          }}>
            <h1 style={{ marginTop: 0, textAlign: 'center' }}>Login</h1>
            <Login
              onLoginDone={this.onLoginDone.bind(this)}
              onLogoutDone={this.onLogoutDone.bind(this)}
              loginPath={'/login'}
              logoutPath={'/logout'} />
          </div>
        </div>
      }
    </div >
  }
}

export default App
