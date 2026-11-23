// Error boundary around the scan view (scan-screen 6.3). A case that makes rendering throw
// shows one sentence instead of a blank page; the mode switcher sits outside and keeps working.
// The parent gives it a `key` per case, so choosing another case starts it afresh.
import { Component, type ReactNode } from "react";
import { t } from "../i18n/t";

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <p className="app__error" role="alert">
        {t("app.error")}
      </p>
    ) : (
      this.props.children
    );
  }
}
