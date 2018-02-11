import React, {Component} from 'react'
import * as R from 'ramda'
import TrackTitle from './TrackTitle.js'
import FontAwesome from 'react-fontawesome'

class Preview extends Component {
  render() {
    return <div className='preview'>
      <button style={{ position: 'absolute', margin: 10 }} onClick={() => this.props.onMenuClicked()}><FontAwesome
        name='bars'/></button>
      <TrackTitle className="preview-title" artists={this.props.preloadTracks[0].artists}
                  title={this.props.preloadTracks[0].title}/>
      <div className='player-wrapper'>
        <button className='button button__light button-playback' onClick={() => this.props.onPrevious()}>
          <FontAwesome name='step-backward'/>
        </button>
        <button className='button button__light button-playback' onClick={() => this.props.onNext()}>
          <FontAwesome name='step-forward'/>
        </button>
        {
          this.props.preloadTracks.map(({ id, previews }, i) =>
            <audio className='fluid' key={id} controls={i === 0} autoPlay={i === 0} onEnded={() => this.props.onNext()}
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
