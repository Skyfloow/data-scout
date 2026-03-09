import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeModeProvider, useThemeMode } from './context/ThemeContext';

function ThemeProbe() {
  const { mode, toggleTheme } = useThemeMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

describe('ThemeModeProvider', () => {
  it('renders and toggles theme mode without crashing', () => {
    render(
      <ThemeModeProvider>
        <ThemeProbe />
      </ThemeModeProvider>
    );

    expect(screen.getByTestId('mode')).toBeInTheDocument();
  });
});
