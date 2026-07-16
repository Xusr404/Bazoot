import { Component } from 'react'

// Per-screen error boundary (Phase 9E): a crash in one game screen shows a
// fallback instead of unmounting the whole app; the next status swap remounts.
export class ScreenErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Screen crashed:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
          <h2 className="text-center text-3xl font-bold text-white drop-shadow-lg">
            Something went wrong on this screen
          </h2>
        </section>
      )
    }

    return this.props.children
  }
}
