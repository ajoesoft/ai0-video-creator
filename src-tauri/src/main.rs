// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use log::{info,debug};

fn main() {
    ai0_video_creator_lib::run()
}
