import React, {Component} from 'react'
import * as R from 'ramda'
import TrackTitle from './TrackTitle.js'
import FontAwesome from 'react-fontawesome'
import * as L from 'partial.lenses'
import {preview} from './Preview.css'

const safePropEq = (prop, value) => R.pipe(
  R.defaultTo({}),
  R.propEq(prop, value)
)

class Preview extends Component {
  constructor(props) {
    super(props)

    this.state = { playing: false, position: 0, totalDuration: R.propOr(0, 'duration', this.props.preloadTracks[0]) }
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
    if (this.state.playing !== playing) {
      this.getPlayer()[playing ? 'play' : 'pause']()
    }
  }

  getCurrentTrack() {
    return this.props.preloadTracks[0]
  }

  render() {
    const waveform = L.collect([0, 'previews', L.satisfying(safePropEq('format', 'mp3')), 'waveform', L.defaults('')], this.props.preloadTracks)[0]
    const toPositionPercent = currentPosition => currentPosition / this.state.totalDuration * 100
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
          debugger
          console.log((e.clientX - e.target.x), e.clientX, e.clientX / e.currentTarget.clientWidth)
          this.getPlayer().currentTime = (e.clientX - e.target.x) / e.currentTarget.clientWidth * this.state.totalDuration / 1000
        }
        }>
          <img src={waveform} className='waveform waveform-background'/>
          <div className='waveform waveform-position'
               style={{ clipPath: `polygon(0 0, ${toPositionPercent(this.state.position)}% 0, ${toPositionPercent(this.state.position)}% 100%, 0 100%)`, WebkitMaskImage: `url(${waveform})`, maskImage: `url(${waveform})` }}/>
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
