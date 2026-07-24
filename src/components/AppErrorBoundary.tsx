import {Component, type ReactNode} from "react";
import {Button} from "@heroui/react";

type Props = {children: ReactNode};
type State = {failed: boolean};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {failed: false};

  static getDerivedStateFromError(): State {
    return {failed: true};
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
        <section
          className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow)]"
          role="alert"
          aria-live="assertive"
        >
          <h1 className="text-xl font-bold">Pagina nu a putut fi afișată</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Datele tale nu au fost modificate. Reîncarcă aplicația pentru a încerca din nou.
          </p>
          <Button className="mt-6 bg-[var(--primary)] text-white" onPress={() => window.location.reload()}>
            Reîncarcă aplicația
          </Button>
        </section>
      </main>
    );
  }
}
