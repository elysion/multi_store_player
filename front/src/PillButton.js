import React, {Component} from 'react'

class PillButton extends Component {
  render() {
    return <button
      className={`${this.props.className || ''} button pill pill-button`}
      onClick={(e) => this.props.onClick(e)}
      disabled={this.props.disabled}
    >
      <span className='pill-button-contents'>{this.props.children}</span>
    </button>
  }
}

export default PillButton
