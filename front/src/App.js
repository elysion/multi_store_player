import React, {Component} from 'react';
import * as R from 'ramda'
import * as Slideout from 'slideout'

import Login from './Login.js'
import Menu from './Menu.js'
import './App.css'
import Preview from './Preview.js'
import Tracks from './Tracks.js'
import requestJSONwithCredentials from './request-json-with-credentials.js'
// import injectTapEventPlugin from 'react-tap-event-plugin';
// injectTapEventPlugin();

const preloadWindowSize = 0

const getJsonFromResults = results => {
  if (results.ok) {
    return results.json()
  } else {
    throw new Error('Failed to fetch carts')
  }
}

const window = R.curry((size, startFrom, list) =>
  list.slice(startFrom, startFrom + size))

const preloadWindow = window(preloadWindowSize + 1)

class Player extends Component {
  constructor(props) {
    super(props)

    this.state = {
      currentTrack: null,
      tracks: null,
      preloadTracks: [{}],
      activeSession: null
    }
  }

  componentDidMount() {
    this.updateTracks()
      .then(() => this.onLoginDone())
      .catch(() => this.setState({activeSession: false}))

    document.addEventListener('keydown', event => {
      if (this.state.activeSession &&
        event instanceof KeyboardEvent &&
        !event.target.form &&
        !event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey
      ) {
        switch (event.key) {
          case 'e':
            this.playNextTrack()
            break
          case 'q':
            this.playPreviousTrack()
            break
          case 'r':
            this.playNextUnheard()
            break
          default:
        }
      }
    })
  }

  setTracks(tracks) {
    const preloadTracks = preloadWindow(0, tracks)
    this.setState({ preloadTracks, tracks: tracks.slice(0, 300) })
    const currentTrack = JSON.parse(localStorage.getItem('currentTrack'))
    this.setCurrentTrack(currentTrack || tracks[0])
  }

  setCurrentTrack(track) {
    localStorage.setItem('currentTrack', JSON.stringify(track))
    const preloadTracks = preloadWindow(this.getTrackIndex(track), this.state.tracks)
    this.setState({ currentTrack: track, preloadTracks })
    requestJSONwithCredentials({
      path: `/tracks/${track.id}`,
      method: 'POST',
      body: { heard: true }
    })
      .then(() => this.markAsPlayed(track.id))
  }

  markAsPlayed(trackId) {
    const trackIndex = this.state.tracks.findIndex(R.propEq('id', trackId))
    this.setState({
      tracks: R.assocPath([trackIndex, 'heard'], true, this.state.tracks)
    })
  }

  getCurrentTrackIndex() {
    return this.getTrackIndex(this.state.currentTrack)
  }

  getTrackIndex(track) {
    return R.findIndex(R.propEq('id', track.id), this.state.tracks)
  }

  onLoginDone() {
    this.setState({activeSession: true})
    return this.updateTracks()
      .catch(() => ({}))
  }

  updateTracks() {
    return requestJSONwithCredentials({
      path: `/tracks`
    })
      .then(getJsonFromResults)
      .then(tracks => this.setTracks(tracks))
  }

  addToCart(store, id) {
    requestJSONwithCredentials({
      path: `/store/${store}/carts/cart`,
      method: 'POST',
      body: { trackId: id }
    })
    // TODO: add added notification?
      .then(this.props.onAddToCart.bind(this, store))
  }

  removeFromCart(store, id) {
    requestJSONwithCredentials({
      path: `/store/${store}/carts/cart`,
      method: 'DELETE',
      body: { trackId: id }
    })
    // TODO: add removed notification?
      .then(this.props.onRemoveFromCart.bind(this, store))
  }

  jumpTracks(numberOfTracksToJump) {
    const currentTrackIndex = this.getCurrentTrackIndex()
    const indexToJumpTo =
      R.clamp(0, this.state.tracks.length - 1, currentTrackIndex + numberOfTracksToJump)
    this.setCurrentTrack(this.state.tracks[indexToJumpTo])
  }

  playPreviousTrack() {
    this.jumpTracks(-1)
  }

  playNextTrack() {
    this.jumpTracks(1)
  }

  playNextUnheard() {
    const firstUnplayed = this.state.tracks.findIndex(R.propEq('heard', false))
    this.jumpTracks(firstUnplayed - this.getCurrentTrackIndex())
  }

  ignoreArtistsByLabel(artistsAndLabels) {
    requestJSONwithCredentials({
      path: `/ignore/label`,
      method: 'POST',
      body: artistsAndLabels
    })
  }

  render() {
    return <div id="panel" style={{height: "100%", overflow: "hidden"}}>
      {
        this.state.activeSession === null ?
          <div>Loading...</div> :
          this.state.tracks ?
            [<Preview
                key={'preview'}
                onMenuClicked={() => this.props.onMenuClicked()}
                preloadTracks={this.state.preloadTracks}
                onPrevious={() => this.playPreviousTrack()}
                onNext={() => this.playNextTrack()}/>,
              <Tracks
                key={'tracks'}
                carts={this.props.carts}
                tracks={this.state.tracks}
                currentTrack={(this.state.preloadTracks[0] || {}).id}
                onAddToCart={this.addToCart}
                onRemoveFromCart={this.removeFromCart}
                onIgnoreArtistsByLabel={this.ignoreArtistsByLabel}
                onPreviewRequested={id => {
                  const requestedTrack = R.find(R.propEq('id', id), this.state.tracks)
                  this.setCurrentTrack(requestedTrack)
                }}/>] :
            <Login
              className='align-center-container'
              onLoginDone={this.onLoginDone.bind(this)}
              loginPath={'/login'}/>
      }
    </div>
  }
}

class App extends Component {
  constructor(props) {
    super(props)
    this.state = {
      slideout: null,
      carts: {}
    }
  }

  componentDidMount() {
    const slideout = new Slideout({
      'panel': document.getElementById('panel'),
      'menu': document.getElementById('menu'),
      'padding': 256,
      'tolerance': 70
    })

    slideout.on('open', () => this.refs['menu'].updateLogins())

    this.setState({
      slideout
    })
  }

  setCarts(store, carts) {
    this.setState(R.evolve({
      carts: R.assoc(store, carts)
    }))
  }

  updateCarts(store) {
    return requestJSONwithCredentials({ path: `/store/${store}/carts` })
      .then(getJsonFromResults)
      .then(carts => this.setCarts(store, carts))
  }

  render() {
    return <div className="root" style={{ height: "100%", overflow: "hidden" }}>
      <Menu ref="menu" onLoginDone={(store => this.updateCarts(store)).bind(this)}></Menu>
      <Player
        onMenuClicked={() => {
          this.state.slideout.toggle()
        }}
        carts={this.state.carts}
        onAddToCart={(store => this.updateCarts(store)).bind(this)}
        onRemoveFromCart={(store => this.updateCarts(store)).bind(this)}
      ></Player>
    </div>
  }
}

export default App
