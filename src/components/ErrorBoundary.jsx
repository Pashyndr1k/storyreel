import { Component } from 'react';

// Prevents a single render error from blanking the whole app (white/black screen).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('StoryReel crashed:', error, info);
  }

  goHome = () => {
    this.setState({ error: null });
    this.props.onHome?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="app-page">
          <div className="app-frame" style={{ display: 'block' }}>
            <div className="crash">
              <h2>Something went wrong</h2>
              <p className="stage-desc">
                This view hit an unexpected error. Your projects are safe.
              </p>
              <pre className="crash-detail">{String(this.state.error?.message || this.state.error)}</pre>
              <div className="row">
                <button className="btn primary" onClick={this.goHome}>Back to projects</button>
                <button className="btn" onClick={() => window.location.reload()}>Reload app</button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
