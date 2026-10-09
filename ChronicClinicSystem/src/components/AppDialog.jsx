// AppDialog.jsx
// A popup box used for messages, "Are you sure?" questions and pick-from-a-list menus.
// We use this instead of Alert.alert because Alert does NOT work in the web browser.

import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';

// ---------------------------------------------------------------------------
// useDialog: a small helper that gives a screen 3 easy ways to show a popup
//
//   const { dialog, close, info, confirm, pick } = useDialog();
//
//   info('Title', 'Message')                      -> a message with an OK button
//   confirm('Title', 'Message', 'Yes', doThis)    -> Cancel / Yes buttons
//   pick('Title', ['A','B'], 'A', (value) => ...) -> a list to choose from
//
// Then put <AppDialog dialog={dialog} onClose={close} /> at the bottom of the screen.
// ---------------------------------------------------------------------------
export function useDialog() {
  const [dialog, setDialog] = useState(null);

  const close = () => setDialog(null);

  const info = (title, message) => {
    setDialog({ title, message, actions: [{ label: 'OK', primary: true }] });
  };

  const confirm = (title, message, confirmLabel, onConfirm, danger = false) => {
    setDialog({
      title,
      message,
      actions: [
        { label: 'Cancel' },
        { label: confirmLabel, primary: true, danger, onPress: onConfirm },
      ],
    });
  };

  const pick = (title, options, current, onSelect) => {
    // Allow simple lists like ['A', 'B'] or objects like { label, value }
    const cleaned = options.map((o) =>
      typeof o === 'object' ? o : { label: String(o), value: o }
    );
    setDialog({ title, options: cleaned, current, onSelect });
  };

  return { dialog, close, info, confirm, pick };
}

// ---------------------------------------------------------------------------
// The popup itself
// ---------------------------------------------------------------------------
export default function AppDialog({ dialog, onClose }) {
  const { colors, fs } = useSettings();
  const styles = useMemo(() => makeStyles(colors, fs), [colors, fs]);

  if (!dialog) return null; // nothing to show

  const { title, message, options, current, onSelect, actions } = dialog;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      {/* Tapping the dark background closes the popup */}
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* This inner Pressable stops taps on the box from closing it */}
        <Pressable style={styles.box} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          {/* A list of options to choose from */}
          {options && (
            <View style={{ marginTop: 8 }}>
              {options.map((option, index) => {
                const selected = option.value === current;
                return (
                  <Pressable
                    key={String(option.value)}
                    accessibilityRole="button"
                    onPress={() => {
                      onSelect(option.value);
                      onClose();
                    }}
                    style={[styles.optionRow, index > 0 && styles.optionDivider]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        selected && { color: colors.primary, fontWeight: '700' },
                      ]}
                    >
                      {option.label}
                    </Text>
                    {selected && (
                      <Ionicons name="checkmark" size={20} color={colors.primary} />
                    )}
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                style={[styles.button, styles.buttonGhost, { marginTop: 12 }]}
              >
                <Text style={styles.buttonGhostText}>Cancel</Text>
              </Pressable>
            </View>
          )}

          {/* Buttons for info / confirm popups */}
          {actions && (
            <View style={styles.actionsRow}>
              {actions.map((action) => (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  onPress={() => {
                    onClose();
                    if (action.onPress) action.onPress();
                  }}
                  style={[
                    styles.button,
                    action.primary
                      ? action.danger
                        ? styles.buttonDanger
                        : styles.buttonPrimary
                      : styles.buttonGhost,
                  ]}
                >
                  <Text
                    style={action.primary ? styles.buttonPrimaryText : styles.buttonGhostText}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c, fs) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', padding: 24 },
    box: {
      backgroundColor: c.surface,
      borderRadius: 20,
      padding: 20,
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
    },
    title: { fontSize: fs(19), fontWeight: '700', color: c.text },
    message: { fontSize: fs(15), color: c.muted, marginTop: 8, lineHeight: fs(22) },
    optionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      minHeight: 52,
    },
    optionDivider: { borderTopWidth: 1, borderTopColor: c.border },
    optionText: { fontSize: fs(16), color: c.text },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    button: {
      flex: 1,
      minHeight: 48,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    buttonPrimary: { backgroundColor: c.primary },
    buttonDanger: { backgroundColor: c.danger },
    buttonGhost: { backgroundColor: c.bg },
    buttonPrimaryText: { color: c.onPrimary, fontSize: fs(15), fontWeight: '700' },
    buttonGhostText: { color: c.text, fontSize: fs(15), fontWeight: '600' },
  });