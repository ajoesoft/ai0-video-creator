// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
     std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    // 2. 关闭视频硬件硬解码，GPU占用直接腰斩，解码转移CPU
    std::env::set_var("WEBKIT_DISABLE_VIDEO_ACCELERATION", "1");
    // 3. 禁用2D画布/图片硬件加速渲染
    std::env::set_var("WEBKIT_DISABLE_ACCELERATED_2D_CANVAS", "1");
    // 4. 降低合成器刷新频率，闲置时减少GPU绘制循环
    std::env::set_var("WEBKIT_COMPOSITING_THROTTLE", "1");
    // Linux Wayland 兼容：强制X11后端，规避无限显存泄漏
    std::env::set_var("GDK_BACKEND", "x11");
    ai0_video_creator_lib::run()
}
