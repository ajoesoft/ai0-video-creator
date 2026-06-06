// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use log::{info,debug};

fn main() {
    info!("✅ 普通信息日志");
    debug!("✅ 这是一条普通信息日志，包含一些调试信息。");
    ai0_video_creator_lib::run()
}
