import React, {Component} from 'react'
import * as R from 'ramda'
import TrackTitle from './TrackTitle.js'
import FontAwesome from 'react-fontawesome'
import * as L from 'partial.lenses'
import {preview} from './Preview.css'
import browser from 'browser-detect';

const safePropEq = (prop, value) => R.pipe(
  R.defaultTo({}),
  R.propEq(prop, value)
)

class Preview extends Component {
  constructor(props) {
    super(props)

    this.state = { playing: false, position: 0 }
  }

  setPlaying(playing) {
    this.setState({ playing })
  }

  togglePlaying() {
    this.setState({ playing: !this.state.playing })
  }

  getPlayer() {
    return this.refs['player0']
  }

  componentWillUpdate(_, { playing }) {
    if (browser().name === 'safari') return

    if (this.state.playing !== playing) {
      this.getPlayer()[playing ? 'play' : 'pause']()
    }
  }

  getCurrentTrack() {
    return this.props.preloadTracks[0]
  }

  render() {
    const mp3Preview = L.collect(['previews', L.satisfying(safePropEq('format', 'mp3'))], this.getCurrentTrack())[0]
    const waveform = mp3Preview.waveform
    const totalDuration = mp3Preview.track_duration_ms
    const startOffset = mp3Preview.start_ms
    const endPosition = mp3Preview.end_ms
    const toPositionPercent = currentPosition => (currentPosition + startOffset) / totalDuration * 100
    return <div className='preview'>
      <button style={{ position: 'absolute', margin: 10 }} onClick={() => this.props.onMenuClicked()}><FontAwesome
        name='bars'/></button>
      <TrackTitle className="preview-title" artists={(this.props.preloadTracks[0] || { artists: [] }).artists}
                  title={(this.props.preloadTracks[0] || {}).title}/>
      <div className='player-wrapper'>
        <button className='button button__light button-playback' onClick={() => this.props.onPrevious()}>
          <FontAwesome name='step-backward'/>
        </button>
        <button className='button button__light button-playback' onClick={() => this.props.onNext()}>
          <FontAwesome name='step-forward'/>
        </button>

        <button className='button button__light button-playback' onClick={() => this.togglePlaying()}>
          <FontAwesome name={this.state.playing ? 'pause' : 'play'}/>
        </button>
        <div className='fluid waveform_container' onClick={e => {
          const trackPositionPercent = (e.clientX - e.currentTarget.offsetLeft) / e.currentTarget.clientWidth
          const previewPositionInSeconds = (totalDuration * trackPositionPercent - startOffset) / 1000
          this.getPlayer().currentTime = previewPositionInSeconds
        }}>
          <img src={waveform} className='waveform waveform-background'/>
          <div className='waveform waveform-position'
               style={{ clipPath: `polygon(${toPositionPercent(0)}% 0, ${toPositionPercent(this.state.position)}% 0, ${toPositionPercent(this.state.position)}% 100%, ${toPositionPercent(0)}% 100%)`, WebkitMaskImage: `url(${waveform})`, maskImage: `url(${waveform})` }}/>
        </div>
        {
          this.props.preloadTracks.map(({ id, previews }, i) =>
            <audio className='fluid' key={id} ref={`player${i}`} autoPlay={i === 0} onEnded={() => {
              this.setPlaying(false)
              this.props.onNext()
            }}
                   onPlaying={() => this.setPlaying(true)}
                   onPause={() => this.setPlaying(false)}
                   onTimeUpdate={({ currentTarget: { currentTime } }) => {
                     // debugger
                     this.setState({ position: currentTime * 1000 })
                   }}
                   controlsList="nodownload">
              {/*<source src={`${backendHref}/tracks.pls`}/>*/}
              <source src={previews.find(R.propEq('format', 'mp3')).url}/>
            </audio>)
        }
      </div>
    </div>
  }
}

export default Preview
