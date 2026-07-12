import { Component, type ErrorInfo, type ReactNode } from "react";

interface State { error: Error | null }

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ui] unrecoverable render error", error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return <main className="fatal-error" role="alert">
      <h1>Не удалось открыть экран</h1>
      <p>Данные не потеряны. Обновите экран; если ошибка повторится, передайте время ошибки администратору.</p>
      <details><summary>Техническая информация</summary><code>{this.state.error.message}</code></details>
      <button onClick={() => { this.setState({ error: null }); window.location.reload(); }}>Обновить приложение</button>
    </main>;
  }
}
