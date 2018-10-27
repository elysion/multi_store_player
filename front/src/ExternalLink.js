import React, { Component } from 'react'
import * as R from 'ramda'

class ExternalLink extends Component {
  getDefaultProps() {
    return {
      onClick: () => {}
    }
  }

  render() {
    return (
      <a
        className={`${this.props.className || ''} external-link`}
        target='_blank'
        {...(R.dissoc('children', this.props))}
      >
        {this.props.children}
      </a>
    )
  }
}

export default ExternalLink
