import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { People } from "@sever/contracts";
import { api, setToken } from "../../lib/api.ts";
import { Card, Button, Field, Input, Loading, SeverStar } from "../../ui-kit/index.ts";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-screen sever">
      <div className="auth-wallpaper" aria-hidden="true">
        <i /><i /><i /><i />
      </div>
      <main className="auth-shell">
        <div className="auth-brand" aria-label="SEVER">
          <span className="auth-brand__mark"><SeverStar size={34} /></span>
          <strong>SEVER</strong>
        </div>
        {children}
      </main>
    </div>
  );
}

export function AuthGate() {
  const setup = useQuery({ queryKey: ["setup-status"], queryFn: () => api.get<{ needsBootstrap: boolean }>("/api/auth/setup-status"), retry: false });
  if (setup.isLoading) return <Centered><div className="auth-loading"><Loading label="Загрузка…" /></div></Centered>;
  return setup.data?.needsBootstrap ? <BootstrapScreen /> : <LoginScreen />;
}

function BootstrapScreen() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const m = useMutation({
    mutationFn: () => api.post<People.AuthResult>("/api/auth/bootstrap", { email, displayName, password }),
    meta: { successMessage: "Аккаунт владельца создан" },
    onSuccess: (res) => {
      setToken(res.token);
      qc.invalidateQueries();
    },
  });
  return (
    <Centered>
      <Card className="auth-card">
        <div className="auth-card__intro">
          <span>НАСТРОЙКА SEVER</span>
          <h1>Создайте владельца</h1>
          <p>Этот email станет аккаунтом владельца со всеми правами.</p>
        </div>
        <Field label="Ваше имя"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Иван Комаров" /></Field>
        <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></Field>
        <Field label="Пароль (мин. 6)"><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button className="auth-card__submit" block disabled={!email || !displayName || password.length < 6 || m.isPending} onClick={() => m.mutate()}>
          Создать и войти
        </Button>
      </Card>
    </Centered>
  );
}

function LoginScreen() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const m = useMutation({
    mutationFn: () => api.post<People.AuthResult>("/api/auth/login", { email, password }),
    meta: { successMessage: "С возвращением" },
    onSuccess: (res) => {
      setToken(res.token);
      qc.invalidateQueries();
    },
  });
  return (
    <Centered>
      <Card className="auth-card">
        <div className="auth-card__intro">
          <span>SEVER ID</span>
          <h1>Вход</h1>
          <p>Введите данные рабочего аккаунта.</p>
        </div>
        <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></Field>
        <Field label="Пароль"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && email && password && m.mutate()} /></Field>
        <Button className="auth-card__submit" block disabled={!email || !password || m.isPending} onClick={() => m.mutate()}>Войти</Button>
      </Card>
    </Centered>
  );
}

export function ChangePasswordScreen() {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const m = useMutation({
    mutationFn: () => api.post("/api/auth/change-password", { newPassword: password }),
    meta: { successMessage: "Пароль обновлён" },
    onSuccess: () => qc.invalidateQueries(),
  });
  const ok = password.length >= 6 && password === confirm;
  const pasteConfirm = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    e.preventDefault();
    setConfirm(text);
  };
  return (
    <Centered>
      <Card className="auth-card">
        <div className="auth-card__intro">
          <span>БЕЗОПАСНОСТЬ</span>
          <h1>Смените пароль</h1>
          <p>Задайте постоянный пароль для продолжения работы.</p>
        </div>
        <Field label="Новый пароль (мин. 6)">
          <Input
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Повторите пароль">
          <Input
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            inputMode="text"
            value={confirm}
            onPaste={pasteConfirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {confirm && password !== confirm && <p className="auth-card__error">Пароли не совпадают</p>}
        <Button className="auth-card__submit" block disabled={!ok || m.isPending} onClick={() => m.mutate()}>Сохранить</Button>
      </Card>
    </Centered>
  );
}
