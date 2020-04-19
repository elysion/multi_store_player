import React, { Component } from 'react'
import './SpinnerButton.css'

class SpinnerButton extends Component {
  static defaultProps = {
    size: 'small'
  }

  render() {
    return <button
      type='submit'
      disabled={this.props.loading}
      className={`button menu-item button-push_button-${this.props.size} button-push_button-primary ${
        this.props.className}`}
      onClick={this.props.onClick}>
      {
        this.props.loading ?
          <>
            {this.props.loadingLabel}
            <div className='loading-indicator'><div></div><div></div><div></div><div></div></div>
          </> :
          this.props.label
      }
    </button>
  }
}

export default SpinnerButton