import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../components/Login';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
    },
  },
}));

describe('Login Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render login form', () => {
    render(<Login />);
    
    expect(screen.getByText('Village Cafe')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('seu@email.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('should display submit button with correct text', () => {
    render(<Login />);
    
    expect(screen.getByRole('button', { name: /Entrar no Sistema/i })).toBeInTheDocument();
  });

  it('should update email and password on input change', async () => {
    const user = userEvent.setup();
    render(<Login />);
    
    const emailInput = screen.getByPlaceholderText('seu@email.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    
    expect((emailInput as HTMLInputElement).value).toBe('test@example.com');
    expect((passwordInput as HTMLInputElement).value).toBe('password123');
  });

  it('should call signInWithPassword on form submit', async () => {
    const user = userEvent.setup();
    const signInMock = vi.fn().mockResolvedValue({ error: null });
    
    (supabase.auth.signInWithPassword as any) = signInMock;
    
    render(<Login />);
    
    const emailInput = screen.getByPlaceholderText('seu@email.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(screen.getByRole('button', { name: /Entrar no Sistema/i }));
    
    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('should display error message on login failure', async () => {
    const user = userEvent.setup();
    const signInMock = vi.fn().mockResolvedValue({ 
      error: { message: 'Invalid credentials' } 
    });
    
    (supabase.auth.signInWithPassword as any) = signInMock;
    
    render(<Login />);
    
    const emailInput = screen.getByPlaceholderText('seu@email.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    
    await user.type(emailInput, 'wrong@example.com');
    await user.type(passwordInput, 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /Entrar no Sistema/i }));
    
    await waitFor(() => {
      expect(screen.getByText('Credenciais inválidas. Verifique seu e-mail e senha.')).toBeInTheDocument();
    });
  });

  it('should disable button while loading', async () => {
    const user = userEvent.setup();
    const signInMock = vi.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ error: null }), 100))
    );
    
    (supabase.auth.signInWithPassword as any) = signInMock;
    
    render(<Login />);
    
    const emailInput = screen.getByPlaceholderText('seu@email.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitButton = screen.getByRole('button', { name: /Entrar no Sistema/i });
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);
    
    expect(submitButton).toBeDisabled();
    
    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('should show loading text while authenticating', async () => {
    const user = userEvent.setup();
    const signInMock = vi.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ error: null }), 100))
    );
    
    (supabase.auth.signInWithPassword as any) = signInMock;
    
    render(<Login />);
    
    const emailInput = screen.getByPlaceholderText('seu@email.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(screen.getByRole('button', { name: /Entrar no Sistema/i }));
    
    expect(screen.getByRole('button', { name: /A Autenticar/i })).toBeInTheDocument();
  });

  it('should require email and password fields', async () => {
    render(<Login />);
    
    const emailInput = screen.getByPlaceholderText('seu@email.com') as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    
    expect(emailInput.required).toBe(true);
    expect(passwordInput.required).toBe(true);
  });
});
