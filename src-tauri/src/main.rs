#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use keyring::Entry;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct KeychainResult {
    success: bool,
    value: Option<String>,
    error: Option<String>,
}

/// Stocke un secret dans le keychain OS (Windows Credential Manager,
/// macOS Keychain, Linux Secret Service).
#[tauri::command]
fn keychain_set(service: String, key: String, value: String) -> KeychainResult {
    match Entry::new(&service, &key) {
        Ok(entry) => match entry.set_password(&value) {
            Ok(()) => KeychainResult {
                success: true,
                value: None,
                error: None,
            },
            Err(e) => KeychainResult {
                success: false,
                value: None,
                error: Some(format!("{}", e)),
            },
        },
        Err(e) => KeychainResult {
            success: false,
            value: None,
            error: Some(format!("{}", e)),
        },
    }
}

/// Recupere un secret depuis le keychain OS.
#[tauri::command]
fn keychain_get(service: String, key: String) -> KeychainResult {
    match Entry::new(&service, &key) {
        Ok(entry) => match entry.get_password() {
            Ok(password) => KeychainResult {
                success: true,
                value: Some(password),
                error: None,
            },
            Err(e) => KeychainResult {
                success: false,
                value: None,
                error: Some(format!("{}", e)),
            },
        },
        Err(e) => KeychainResult {
            success: false,
            value: None,
            error: Some(format!("{}", e)),
        },
    }
}

/// Supprime un secret du keychain OS.
#[tauri::command]
fn keychain_delete(service: String, key: String) -> KeychainResult {
    match Entry::new(&service, &key) {
        Ok(entry) => match entry.delete_credential() {
            Ok(()) => KeychainResult {
                success: true,
                value: None,
                error: None,
            },
            Err(e) => KeychainResult {
                success: false,
                value: None,
                error: Some(format!("{}", e)),
            },
        },
        Err(e) => KeychainResult {
            success: false,
            value: None,
            error: Some(format!("{}", e)),
        },
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            keychain_set,
            keychain_get,
            keychain_delete
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du demarrage d'ARGOS");
}
