use crate::paths;
use serde_json::Value;
use std::io::{self, BufRead, BufReader, Write};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

#[cfg(unix)]
type Stream = std::os::unix::net::UnixStream;
#[cfg(windows)]
type Stream = std::fs::File;

#[cfg(unix)]
fn connect() -> io::Result<Stream> {
    std::os::unix::net::UnixStream::connect(paths::ipc_path())
}

#[cfg(windows)]
fn connect() -> io::Result<Stream> {
    std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(paths::ipc_path())
}

fn exchange(cmd: String) -> io::Result<Option<Value>> {
    let mut stream = connect()?;
    stream.write_all(cmd.as_bytes())?;
    stream.flush()?;
    let mut reader = BufReader::new(stream);
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 {
            return Ok(None);
        }
        if line.contains("\"error\"") {
            return Ok(serde_json::from_str(&line).ok());
        }
    }
}

pub fn send(command: &Value) -> Option<Value> {
    let cmd = format!("{command}\n");
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let _ = tx.send(exchange(cmd));
    });
    match rx.recv_timeout(Duration::from_secs(1)) {
        Ok(Ok(v)) => v,
        _ => None,
    }
}

pub fn get_prop(name: &str) -> Option<Value> {
    let reply = send(&serde_json::json!({ "command": ["get_property", name] }))?;
    if reply.get("error").and_then(Value::as_str) == Some("success") {
        reply.get("data").cloned()
    } else {
        None
    }
}

pub fn set_prop(name: &str, value: Value) {
    let _ = send(&serde_json::json!({ "command": ["set_property", name, value] }));
}

pub fn command(args: Value) {
    let _ = send(&serde_json::json!({ "command": args }));
}
