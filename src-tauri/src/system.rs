// System 칸: 이 PC의 CPU · 메모리 · 디스크 · 배터리 · 메모리를 많이 쓰는 프로그램.
// 칸이 열려 있는 동안 화면이 2초마다 부른다. CPU 사용률은 직전 호출과의 차이로 재므로 System을 계속 들고 있는다.
use serde::Serialize;
use std::sync::Mutex;
use sysinfo::{Disks, ProcessesToUpdate, System};

pub struct SysState(pub Mutex<System>);

impl Default for SysState {
    fn default() -> Self {
        Self(Mutex::new(System::new()))
    }
}

#[derive(Serialize)]
pub struct Disk {
    mount: String,
    total: u64,
    free: u64,
}

#[derive(Serialize)]
pub struct Proc {
    name: String,
    mem: u64,
}

#[derive(Serialize)]
pub struct Battery {
    percent: Option<u8>,
    charging: bool,
    plugged: bool,
    minutes_left: Option<u32>,
}

#[derive(Serialize)]
pub struct Info {
    os: String,
    host: String,
    cpu_name: String,
    cores: usize,
    cpu: f32,
    per_core: Vec<f32>,
    mem_total: u64,
    mem_used: u64,
    uptime: u64,
    disks: Vec<Disk>,
    top: Vec<Proc>,
    battery: Option<Battery>,
}

#[tauri::command]
pub fn system_info(state: tauri::State<SysState>) -> Info {
    let mut sys = state.0.lock().unwrap();
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    // 같은 이름(크롬 탭 여러 개 등)은 하나로 합쳐 메모리 많이 쓰는 순서로 5개
    let mut by_name: std::collections::HashMap<String, u64> = Default::default();
    for p in sys.processes().values() {
        *by_name.entry(p.name().to_string_lossy().into_owned()).or_default() += p.memory();
    }
    let mut top: Vec<Proc> = by_name.into_iter().map(|(name, mem)| Proc { name, mem }).collect();
    top.sort_by(|a, b| b.mem.cmp(&a.mem));
    top.truncate(5);

    let disks = Disks::new_with_refreshed_list()
        .list()
        .iter()
        .map(|d| Disk { mount: d.mount_point().to_string_lossy().into_owned(), total: d.total_space(), free: d.available_space() })
        .collect();

    Info {
        os: format!("{} {}", System::name().unwrap_or_default(), System::os_version().unwrap_or_default()),
        host: System::host_name().unwrap_or_default(),
        cpu_name: sys.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_default(),
        cores: sys.cpus().len(),
        cpu: sys.global_cpu_usage(),
        per_core: sys.cpus().iter().map(|c| c.cpu_usage()).collect(),
        mem_total: sys.total_memory(),
        mem_used: sys.used_memory(),
        uptime: System::uptime(),
        disks,
        top,
        battery: battery(),
    }
}

#[cfg(windows)]
fn battery() -> Option<Battery> {
    use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut s: SYSTEM_POWER_STATUS = unsafe { std::mem::zeroed() };
    if unsafe { GetSystemPowerStatus(&mut s) } == 0 || s.BatteryFlag == 128 {
        return None; // 배터리 없는 PC (데스크톱)
    }
    Some(Battery {
        percent: (s.BatteryLifePercent <= 100).then_some(s.BatteryLifePercent),
        charging: s.BatteryFlag & 8 != 0,
        plugged: s.ACLineStatus == 1,
        minutes_left: (s.BatteryLifeTime != u32::MAX).then(|| s.BatteryLifeTime / 60),
    })
}

#[cfg(not(windows))]
fn battery() -> Option<Battery> {
    None
}
