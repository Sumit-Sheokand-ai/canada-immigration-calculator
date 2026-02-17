import { Component } from 'react';
import { trackError } from '../utils/analytics';

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected application error.',
    };
  }

  componentDidCatch(error, errorInfo) {
    trackError('app_error_boundary_triggered', error, {
      component_stack: String(errorInfo?.componentStack || '').slice(0, 600),
      route: typeof window !== 'undefined' ? window.location.pathname : 'server',
    });
  }

  handleTryAgain = () => {
    this.setState({
      hasError: false,
      errorMessage: '',
    });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="error-boundary-screen" role="alert" aria-live="assertive">
        <section className="error-boundary-card">
          <h1>Something went wrong</h1>
          <p>We hit an unexpected issue while rendering this page.</p>
          <p className="error-boundary-message">{this.state.errorMessage}</p>
          <div className="error-boundary-actions">
            <button type="button" className="action-btn auth-btn-primary" onClick={this.handleTryAgain}>
              Try again
            </button>
            <button type="button" className="action-btn" onClick={() => window.location.reload()}>
              Reload app
            </button>
          </div>
        </section>
      </main>
    );
  }
}
