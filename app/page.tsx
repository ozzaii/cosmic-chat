'use client'
import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  TextField,
  Button,
  Typography,
  Paper,
  Alert,
  IconButton,
  InputAdornment,
  Slide,
  CircularProgress,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: ''
  });

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return;
      }

      console.log('Current session user:', session.user.email);

      // Check if profile exists
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id);

      if (profileError) throw profileError;

      // If no profile exists, create one
      if (!profile || profile.length === 0) {
        const { error: createProfileError } = await supabase
          .from('profiles')
          .insert([
            {
              id: session.user.id,
              email: session.user.email,
              username: session.user.email?.split('@')[0] || 'user',
            }
          ]);

        if (createProfileError) throw createProfileError;

        // Fetch the newly created profile
        const { data: newProfile, error: newProfileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (newProfileError) throw newProfileError;
        
        console.log('Setting current user:', newProfile);
        setCurrentUser(newProfile);
      } else {
        console.log('Setting current user:', profile);
      }

      router.push('/chat');
    } catch (error) {
      console.error('Error checking user:', error);
      // Don't redirect on error, just log it
      setError('Error loading profile. Please try again.');
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        
        if (error) throw error;
        if (data.user) {
          console.log('Logged in as:', data.user.email);
          await checkUser(); // Check and create profile if needed
        }
      } else {
        const { data: { user }, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              username: formData.username,
            }
          }
        });

        if (signUpError) throw signUpError;

        if (user) {
          // Create profile immediately after signup
          const { error: profileError } = await supabase
            .from('profiles')
            .insert([
              {
                id: user.id,
                username: formData.username,
                email: formData.email,
              }
            ]);

          if (profileError) throw profileError;
          setError('Success! Please check your email to confirm your account.');
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #1976d2 0%, #64b5f6 100%)',
      }}
    >
      <Container maxWidth="sm">
        <Slide in={true} direction="up">
          <Paper
            elevation={4}
            sx={{
              p: 4,
              borderRadius: 3,
              bgcolor: 'rgba(255, 255, 255, 0.98)',
            }}
          >
            <Typography 
              variant="h4" 
              align="center" 
              sx={{ 
                mb: 4,
                fontWeight: 'bold',
                background: 'linear-gradient(45deg, #1976d2, #64b5f6)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </Typography>

            {error && (
              <Alert 
                severity={error.includes('Success') ? 'success' : 'error'} 
                sx={{ mb: 3 }}
              >
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              {!isLogin && (
                <TextField
                  fullWidth
                  label="Username"
                  margin="normal"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  disabled={loading}
                  sx={{ mb: 2 }}
                />
              )}

              <TextField
                fullWidth
                label="Email"
                type="email"
                margin="normal"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={loading}
                sx={{ mb: 2 }}
              />

              <TextField
                fullWidth
                label="Password"
                type={showPassword ? 'text' : 'password'}
                margin="normal"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                disabled={loading}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 3 }}
              />

              <Button
                fullWidth
                variant="contained"
                type="submit"
                disabled={loading}
                sx={{
                  py: 1.5,
                  mb: 2,
                  borderRadius: 2,
                  fontSize: '1.1rem',
                  textTransform: 'none',
                  bgcolor: 'primary.main',
                  '&:hover': {
                    bgcolor: 'primary.dark',
                  },
                }}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  isLogin ? 'Sign In' : 'Create Account'
                )}
              </Button>

              <Box sx={{ textAlign: 'center' }}>
                <Button
                  variant="text"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setError('');
                    setFormData({ email: '', password: '', username: '' });
                  }}
                  disabled={loading}
                  sx={{ textTransform: 'none' }}
                >
                  {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                </Button>
              </Box>
            </form>
          </Paper>
        </Slide>
      </Container>
    </Box>
  );
}
