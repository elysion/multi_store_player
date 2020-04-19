import Preview from './Preview.js'
import Tracks from './Tracks.js'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials.js'
import React, { Component } from 'react'
import * as R from 'ramda'

class Player extends Component {
  constructor(props) {
    super(props)

    this.state = {
      currentTrack: null,
      listenedTracks: 0,
      changedTracks: {},
    }

    // if (this.props.tracks.length !== 0) {
    //   const storedTrack = JSON.parse(localStorage.getItem('currentTrack') || '{}')
    //   const currentTrack = storedTrack.track_id && this.props.tracks.find(R.propEq('track_id', storedTrack.track_id)) ||
    //     this.props.tracks[0]
    //   this.setCurrentTrack(currentTrack)
    // }
  }

  componentDidMount() {
    document.addEventListener('keydown', event => {
      if (event instanceof KeyboardEvent &&
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

  async setCurrentTrack(track) {
    localStorage.setItem('currentTrack', JSON.stringify(track))
    this.setState({ currentTrack: track })
    await requestWithCredentials({
      path: `/tracks/${track.id}`,
      method: 'POST',
      body: { heard: true }
    })
    this.markAsPlayed(track.id)
  }

  markAsPlayed(trackId) {
    const track = this.props.tracks.find(R.propEq('id', trackId))
    const changedTrack = this.state.changedTracks[trackId]
    let listenedTracks = this.state.listenedTracks
    if (!track.heard && (!changedTrack || !changedTrack.heard)) {
      listenedTracks++
    }

    const updatedTrack = R.assoc('heard', true, track)
    this.setState({
      changedTracks: R.assocPath([trackId], updatedTrack, this.state.changedTracks),
      listenedTracks
    })
  }

  getCurrentTrackIndex() {
    return this.getTrackIndex(this.state.currentTrack)
  }

  getTrackIndex(track) {
    return R.findIndex(R.propEq('id', track.id), this.props.tracks)
  }

  async addToCart(store, id) {
    await requestJSONwithCredentials({
      path: `/stores/${store}/carts/default`,
      method: 'POST',
      body: { trackId: id }
    })
    this.props.onAddToCart(store)
  }

  async removeFromCart(store, id) {
    await requestJSONwithCredentials({
      path: `/stores/${store}/carts/cart`,
      method: 'DELETE',
      body: { trackId: id }
    })
    // TODO: add removed notification?
    this.props.onRemoveFromCart(store)
  }

  jumpTracks(numberOfTracksToJump) {
    const currentTrackIndex = this.getCurrentTrackIndex()
    const indexToJumpTo =
      R.clamp(0, this.props.tracks.length - 1, currentTrackIndex + numberOfTracksToJump)
    this.setCurrentTrack(this.props.tracks[indexToJumpTo])
  }

  playPreviousTrack() {
    this.jumpTracks(-1)
  }

  playNextTrack() {
    this.jumpTracks(1)
  }

  playNextUnheard() {
    const firstUnplayed = this.props.tracks.findIndex(R.propEq('heard', false))
    this.jumpTracks(firstUnplayed - this.getCurrentTrackIndex())
  }

  async ignoreArtistsByLabel(artistsAndLabels) {
    await requestJSONwithCredentials({
      path: `/ignore/label`,
      method: 'POST',
      body: artistsAndLabels
    })
  }

  render() {
    let tracks = this.props.tracks

    R.mapObjIndexed(
      (_, trackId, track) => {
        const index = this.props.tracks.findIndex(R.propEq('id', parseInt(trackId, 10)))
        tracks[index] = track[trackId]
      },
      this.state.changedTracks
    )

    return <>
      <Preview
        key={'preview'}
        showHint={tracks.length === 0}
        currentTrack={this.state.currentTrack}
        onMenuClicked={() => this.props.onMenuClicked()}
        onPrevious={() => this.playPreviousTrack()}
        onNext={() => this.playNextTrack()} />
      <Tracks
        key={'tracks'}
        carts={this.props.carts}
        tracks={tracks}
        newTracks={this.props.newTracks - this.state.listenedTracks}
        totalTracks={this.props.totalTracks}
        currentTrack={(this.state.currentTrack || {}).id}
        onAddToCart={this.addToCart}
        onRemoveFromCart={this.removeFromCart}
        onIgnoreArtistsByLabel={this.ignoreArtistsByLabel}
        onPreviewRequested={id => {
          const requestedTrack = R.find(R.propEq('id', id), this.props.tracks)
          this.setCurrentTrack(requestedTrack)
        }} />
    </>
  }
}

export default Player