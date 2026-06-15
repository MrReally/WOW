import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { People } from "@sever/contracts";
import { api, setToken } from "../../lib/api.ts";
import { Card, Button, Field, Input, Loading } from "../../ui-kit/index.ts";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div className="t-cond" style={{ fontSize: 34, fontWeight: 800, textAlign: "center", marginBottom: 20, color: "var(--text)" }}>
          SEVER
        </div>
        {children}
      </div>
    </div>
  );
}

export function AuthGate() {
  const setup = useQuery({ queryKey: ["setup-status"], queryFn: () => api.get<{ needsBootstrap: boolean }>("/api/auth/setup-status"), retry: false });
  if (setup.isLoading) return <Loading label="Загрузка…" />;
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
      <Card>
        <p className="card__title" style={{ marginBottom: 4 }}>Первый запуск — создайте владельца</p>
        <p className="card__subtitle" style={{ marginBottom: 16 }}>Этот email станет аккаунтом владельца со всеми правами.</p>
        <Field label="Ваше имя"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Иван Комаров" /></Field>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></Field>
        <Field label="Пароль (мин. 6)"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Button block disabled={!email || !displayName || password.length < 6 || m.isPending} onClick={() => m.mutate()}>
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
      <Card>
        <p className="card__title" style={{ marginBottom: 16 }}>Вход</p>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></Field>
        <Field label="Пароль"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && m.mutate()} /></Field>
        <Button block disabled={!email || !password || m.isPending} onClick={() => m.mutate()}>Войти</Button>
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
  return (
    <Centered>
      <Card>
        <p className="card__title" style={{ marginBottom: 4 }}>Смените временный пароль</p>
        <p className="card__subtitle" style={{ marginBottom: 16 }}>Это нужно сделать при первом входе.</p>
        <Field label="Новый пароль (мин. 6)"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Повторите пароль"><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        {confirm && password !== confirm && <p className="card__subtitle" style={{ color: "var(--alert)" }}>Пароли не совпадают</p>}
        <Button block disabled={!ok || m.isPending} onClick={() => m.mutate()}>Сохранить</Button>
      </Card>
    </Centered>
  );
}
