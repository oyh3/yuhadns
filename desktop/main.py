#!/usr/bin/env python3
"""
YuhaDNS Intra Desktop Client
DNS-over-HTTPS (DoH) local proxy & Intra-like desktop client with auto SSL CA certificate installation.
"""

import sys
import os
import time
import socket
import struct
import platform
import subprocess
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor
import urllib.request
import urllib.error

DEFAULT_DOH_URL = "https://dns.ohyh2016.workers.dev/dns-query"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 53

PROFILES = {
    "기본 (All)": "https://dns.ohyh2016.workers.dev/dns-query",
    "고속 DNS (FastDNS)": "https://dns.ohyh2016.workers.dev/dns-query/fastdns",
    "광고 차단 (Ads)": "https://dns.ohyh2016.workers.dev/dns-query/ads",
    "보안 강화 (Security)": "https://dns.ohyh2016.workers.dev/dns-query/security",
    "가족 보호 (Family)": "https://dns.ohyh2016.workers.dev/dns-query/family"
}

def get_ca_cert_path():
    """Find ca.crt in desktop dir or ../certs/ca.crt."""
    desktop_dir = os.path.dirname(os.path.abspath(__file__))
    local_ca = os.path.join(desktop_dir, "ca.crt")
    if os.path.isfile(local_ca):
        return local_ca
    parent_ca = os.path.abspath(os.path.join(desktop_dir, "..", "certs", "ca.crt"))
    if os.path.isfile(parent_ca):
        return parent_ca
    return local_ca

def parse_dns_qname(data: bytes) -> str:
    """Extract domain name (QNAME) from DNS packet for logging."""
    if len(data) < 12:
        return ""
    idx = 12
    labels = []
    try:
        while idx < len(data):
            length = data[idx]
            if length == 0:
                break
            if length & 0xC0 == 0xC0:
                # Compression pointer - not typical in question section, break
                break
            idx += 1
            if idx + length > len(data):
                break
            labels.append(data[idx:idx + length].decode("utf-8", errors="replace"))
            idx += length
        return ".".join(labels)
    except Exception:
        return ""

def make_servfail(query_data: bytes) -> bytes:
    """Generate DNS SERVFAIL (RCODE 2) packet matching the query transaction ID."""
    if len(query_data) < 12:
        return query_data
    txid = query_data[:2]
    # QR=1, RD=1, RA=1, RCODE=2 (Server failure)
    flags = (0x8182).to_bytes(2, "big")
    qdcount = query_data[4:6]
    return txid + flags + qdcount + b"\x00\x00\x00\x00\x00\x00" + query_data[12:]

class DnsProxyServer:
    def __init__(self, doh_url=DEFAULT_DOH_URL, host=DEFAULT_HOST, port=DEFAULT_PORT, on_query=None):
        self.doh_url = doh_url
        self.host = host
        self.port = port
        self.on_query = on_query
        self.running = False
        self.sock = None
        self.thread = None
        self.executor = ThreadPoolExecutor(max_workers=32)
        self.query_count = 0

    def start(self):
        if self.running:
            return
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.bind((self.host, self.port))
        self.running = True
        self.thread = threading.Thread(target=self._listen_loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None
        if self.thread:
            self.thread.join(timeout=1.0)
            self.thread = None

    def _listen_loop(self):
        while self.running:
            try:
                data, addr = self.sock.recvfrom(4096)
                if not data:
                    continue
                self.executor.submit(self._handle_query, data, addr)
            except (OSError, socket.error):
                break

    def _handle_query(self, data: bytes, addr):
        t0 = time.time()
        domain = parse_dns_qname(data) or "<unknown>"
        self.query_count += 1
        status = "OK"
        response_data = None

        try:
            req = urllib.request.Request(
                self.doh_url,
                data=data,
                headers={
                    "Content-Type": "application/dns-message",
                    "Accept": "application/dns-message",
                    "User-Agent": "YuhaDNS-Intra/1.0"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=4.0) as resp:
                if resp.status == 200:
                    response_data = resp.read()
                else:
                    status = f"HTTP {resp.status}"
                    response_data = make_servfail(data)
        except Exception as e:
            status = f"Err: {e.__class__.__name__}"
            response_data = make_servfail(data)

        elapsed_ms = int((time.time() - t0) * 1000)

        if self.sock and response_data and self.running:
            try:
                self.sock.sendto(response_data, addr)
            except Exception:
                pass

        if self.on_query:
            self.on_query(domain, elapsed_ms, status)

# ---------------------------------------------------------------------------
# OS System DNS Configuration Helpers
# ---------------------------------------------------------------------------

class SystemDnsManager:
    """Manages setting and reverting system DNS to 127.0.0.1 across OSes."""
    def __init__(self):
        self.system = platform.system()
        self.active_interface = None
        self.original_dns = None

    def set_local_dns(self) -> tuple[bool, str]:
        if self.system == "Windows":
            return self._set_windows_dns()
        elif self.system == "Darwin":
            return self._set_macos_dns()
        elif self.system == "Linux":
            return self._set_linux_dns()
        return False, f"지원되지 않는 OS입니다: {self.system}"

    def revert_dns(self) -> tuple[bool, str]:
        if self.system == "Windows":
            return self._revert_windows_dns()
        elif self.system == "Darwin":
            return self._revert_macos_dns()
        elif self.system == "Linux":
            return self._revert_linux_dns()
        return False, f"지원되지 않는 OS입니다: {self.system}"

    # Windows
    def _set_windows_dns(self):
        try:
            # Find active IPv4 interface alias
            ps_cmd = "(Get-NetIPInterface -ConnectionState Connected -AddressFamily IPv4 | Sort-Object InterfaceMetric | Select-Object -ExpandProperty InterfaceAlias)[0]"
            res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True)
            iface = res.stdout.strip()
            if not iface:
                iface = "Wi-Fi"
            self.active_interface = iface
            cmd = ["netsh", "interface", "ipv4", "set", "dnsservers", f'name="{iface}"', "static", "127.0.0.1", "primary"]
            r = subprocess.run(" ".join(cmd), shell=True, capture_output=True, text=True)
            if r.returncode == 0:
                return True, f"Windows DNS가 127.0.0.1 ({iface})로 설정되었습니다."
            return False, f"netsh 권한 부족 또는 오류: {r.stderr or r.stdout}"
        except Exception as e:
            return False, str(e)

    def _revert_windows_dns(self):
        iface = self.active_interface or "Wi-Fi"
        try:
            cmd = ["netsh", "interface", "ipv4", "set", "dnsservers", f'name="{iface}"', "dhcp"]
            subprocess.run(" ".join(cmd), shell=True, capture_output=True)
            return True, f"Windows DNS ({iface})가 원래 DHCP로 복원되었습니다."
        except Exception as e:
            return False, str(e)

    # macOS
    def _set_macos_dns(self):
        try:
            # Find primary network service
            res = subprocess.run(["networksetup", "-listallnetworkservices"], capture_output=True, text=True)
            services = [line.strip() for line in res.stdout.splitlines() if line and not line.startswith("*")]
            service = services[0] if services else "Wi-Fi"
            self.active_interface = service
            r = subprocess.run(["networksetup", "-setdnsservers", service, "127.0.0.1"], capture_output=True, text=True)
            if r.returncode == 0:
                return True, f"macOS DNS가 127.0.0.1 ({service})로 설정되었습니다."
            return False, r.stderr or "DNS 변경 실패"
        except Exception as e:
            return False, str(e)

    def _revert_macos_dns(self):
        service = self.active_interface or "Wi-Fi"
        try:
            subprocess.run(["networksetup", "-setdnsservers", service, "Empty"], capture_output=True)
            return True, f"macOS DNS ({service})가 복원되었습니다."
        except Exception as e:
            return False, str(e)

    # Linux
    def _set_linux_dns(self):
        # 1) Try resolvectl if available
        if shutil.which("resolvectl"):
            try:
                # Find default interface
                route_res = subprocess.run(["ip", "route", "show", "default"], capture_output=True, text=True)
                parts = route_res.stdout.split()
                if "dev" in parts:
                    iface = parts[parts.index("dev") + 1]
                    self.active_interface = iface
                    r = subprocess.run(["resolvectl", "dns", iface, "127.0.0.1"], capture_output=True, text=True)
                    if r.returncode == 0:
                        return True, f"resolvectl을 통해 {iface} DNS를 127.0.0.1로 설정했습니다."
            except Exception:
                pass

        # 2) Fallback or direct resolv.conf
        return True, "로컬 DNS 프록시가 가동 중입니다 (127.0.0.1:53)."

    def _revert_linux_dns(self):
        if self.active_interface and shutil.which("resolvectl"):
            try:
                subprocess.run(["resolvectl", "revert", self.active_interface], capture_output=True)
                return True, f"resolvectl DNS ({self.active_interface})가 복원되었습니다."
            except Exception as e:
                return False, str(e)
        return True, "DNS 설정이 복원되었습니다."

# ---------------------------------------------------------------------------
# SSL Root CA Auto Installation
# ---------------------------------------------------------------------------

def install_root_ca() -> tuple[bool, str]:
    """Auto-installs ca.crt into the OS trusted root certificate store."""
    ca_path = get_ca_cert_path()
    if not os.path.isfile(ca_path):
        return False, f"인증서 파일을 찾을 수 없습니다: {ca_path}"

    system = platform.system()

    if system == "Windows":
        # Try certutil -addstore
        cmd = ["certutil", "-addstore", "-f", "ROOT", ca_path]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0:
            return True, f"인증서가 Windows '신뢰할 수 있는 루트 인증 기관'에 성공적으로 설치되었습니다.\n({ca_path})"
        
        # Try elevated PowerShell
        ps = f'Start-Process powershell -Verb RunAs -ArgumentList \'-NoProfile -Command "Import-Certificate -FilePath \\"{ca_path}\\" -CertStoreLocation Cert:\\LocalMachine\\Root"\' -Wait'
        res = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True)
        if res.returncode == 0:
            return True, "PowerShell 관리자 권한으로 인증서 설치를 완료했습니다."
        return False, f"설치 실패 (관리자 권한 필요): {res.stderr or res.stdout}"

    elif system == "Darwin":
        # macOS Keychain
        apple_script = f'do shell script "security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain \\"{ca_path}\\"" with administrator privileges'
        res = subprocess.run(["osascript", "-e", apple_script], capture_output=True, text=True)
        if res.returncode == 0:
            return True, f"macOS 시스템 키체인에 Root CA 인증서가 등록되었습니다.\n({ca_path})"
        
        # Fallback sudo
        res = subprocess.run(["sudo", "security", "add-trusted-cert", "-d", "-r", "trustRoot", "-k", "/Library/Keychains/System.keychain", ca_path], capture_output=True, text=True)
        if res.returncode == 0:
            return True, "macOS 키체인에 인증서가 등록되었습니다."
        return False, f"설치 실패: {res.stderr}"

    elif system == "Linux":
        target = None
        update_cmd = None
        if os.path.isdir("/usr/local/share/ca-certificates"):
            target = "/usr/local/share/ca-certificates/yuhadns-ca.crt"
            update_cmd = ["update-ca-certificates"]
        elif os.path.isdir("/etc/pki/ca-trust/source/anchors"):
            target = "/etc/pki/ca-trust/source/anchors/yuhadns-ca.crt"
            update_cmd = ["update-ca-trust"]
        elif os.path.isdir("/etc/ca-certificates/trust-source/anchors"):
            target = "/etc/ca-certificates/trust-source/anchors/yuhadns-ca.crt"
            update_cmd = ["trust", "extract-compat"]

        if not target or not update_cmd:
            return False, "지원되는 Linux CA 인증서 디렉터리를 찾지 못했습니다."

        try:
            shutil.copyfile(ca_path, target)
            subprocess.run(update_cmd, check=True, capture_output=True)
            return True, f"인증서가 {target}에 복사되고 CA 저장소가 업데이트되었습니다."
        except PermissionError:
            # Needs root: try pkexec or sudo
            sh_cmd = f"cp '{ca_path}' '{target}' && {' '.join(update_cmd)}"
            if shutil.which("pkexec"):
                res = subprocess.run(["pkexec", "sh", "-c", sh_cmd], capture_output=True, text=True)
                if res.returncode == 0:
                    return True, f"인증서가 시스템 CA 저장소({target})에 성공적으로 설치되었습니다."
            res = subprocess.run(["sudo", "sh", "-c", sh_cmd], capture_output=True, text=True)
            if res.returncode == 0:
                return True, f"인증서가 시스템 CA 저장소({target})에 등록되었습니다."
            return False, f"루트 권한이 필요합니다. 관리자 권한(sudo)으로 실행해 주세요.\n명령어: sudo cp {ca_path} {target} && sudo {' '.join(update_cmd)}"
        except Exception as e:
            return False, str(e)

    return False, f"지원되지 않는 운영체제입니다: {system}"

# ---------------------------------------------------------------------------
# Intra-Style Tkinter GUI
# ---------------------------------------------------------------------------

def run_gui():
    import tkinter as tk
    from tkinter import ttk, messagebox

    root = tk.Tk()
    root.title("YuhaDNS - Intra")
    root.geometry("440x600")
    root.minsize(400, 520)
    root.configure(bg="#0f172a")

    # Intra style theme colors
    BG = "#0f172a"
    CARD_BG = "#1e293b"
    TEXT_MAIN = "#f8fafc"
    TEXT_MUTED = "#94a3b8"
    ACCENT_GREEN = "#10b981"
    ACCENT_RED = "#ef4444"
    ACCENT_BLUE = "#3b82f6"

    proxy = None
    dns_mgr = SystemDnsManager()
    is_connected = False

    # Top title
    header_frame = tk.Frame(root, bg=BG)
    header_frame.pack(fill="x", padx=20, pady=(20, 10))

    title_lbl = tk.Label(header_frame, text="YuhaDNS", font=("Helvetica", 18, "bold"), fg=TEXT_MAIN, bg=BG)
    title_lbl.pack(anchor="w")
    sub_lbl = tk.Label(header_frame, text="DNS-over-HTTPS (DoH) Intra Client", font=("Helvetica", 9), fg=TEXT_MUTED, bg=BG)
    sub_lbl.pack(anchor="w")

    # Status Card
    status_card = tk.Frame(root, bg=CARD_BG, bd=0, highlightthickness=1, highlightbackground="#334155")
    status_card.pack(fill="x", padx=20, pady=10)

    status_icon_lbl = tk.Label(status_card, text="● DISCONNECTED", font=("Helvetica", 14, "bold"), fg=ACCENT_RED, bg=CARD_BG)
    status_icon_lbl.pack(pady=(16, 4))

    status_desc_lbl = tk.Label(status_card, text="DNS 보호가 꺼져 있습니다.", font=("Helvetica", 10), fg=TEXT_MUTED, bg=CARD_BG)
    status_desc_lbl.pack(pady=(0, 16))

    # Toggle Button
    btn_toggle = tk.Button(
        status_card,
        text="연결하기 (CONNECT)",
        font=("Helvetica", 12, "bold"),
        fg="#ffffff",
        bg=ACCENT_BLUE,
        activebackground="#2563eb",
        activeforeground="#ffffff",
        bd=0,
        relief="flat",
        cursor="hand2",
        padx=20,
        pady=10
    )
    btn_toggle.pack(fill="x", padx=20, pady=(0, 16))

    # Configuration Card
    config_card = tk.Frame(root, bg=CARD_BG, bd=0, highlightthickness=1, highlightbackground="#334155")
    config_card.pack(fill="x", padx=20, pady=5)

    profile_lbl = tk.Label(config_card, text="DNS 프로필 선택", font=("Helvetica", 9, "bold"), fg=TEXT_MUTED, bg=CARD_BG)
    profile_lbl.pack(anchor="w", padx=16, pady=(12, 4))

    profile_var = tk.StringVar(value="기본 (All)")
    profile_combobox = ttk.Combobox(config_card, textvariable=profile_var, values=list(PROFILES.keys()), state="readonly")
    profile_combobox.pack(fill="x", padx=16, pady=(0, 8))

    doh_url_var = tk.StringVar(value=DEFAULT_DOH_URL)
    def on_profile_change(*args):
        p = profile_var.get()
        if p in PROFILES:
            doh_url_var.set(PROFILES[p])
    profile_var.trace_add("write", on_profile_change)

    url_entry = tk.Entry(config_card, textvariable=doh_url_var, font=("Helvetica", 9), bg="#0f172a", fg=TEXT_MAIN, bd=1, relief="solid")
    url_entry.pack(fill="x", padx=16, pady=(0, 12))

    # Auto system DNS checkbox
    auto_dns_var = tk.BooleanVar(value=True)
    chk_auto_dns = tk.Checkbutton(
        config_card,
        text="시스템 DNS를 127.0.0.1로 자동 전환",
        variable=auto_dns_var,
        font=("Helvetica", 9),
        fg=TEXT_MAIN,
        bg=CARD_BG,
        selectcolor="#0f172a",
        activebackground=CARD_BG,
        activeforeground=TEXT_MAIN
    )
    chk_auto_dns.pack(anchor="w", padx=16, pady=(0, 12))

    # SSL Certificate Install Card
    cert_card = tk.Frame(root, bg=CARD_BG, bd=0, highlightthickness=1, highlightbackground="#334155")
    cert_card.pack(fill="x", padx=20, pady=5)

    def on_install_cert_click():
        success, msg = install_root_ca()
        if success:
            messagebox.showinfo("SSL 인증서 설치 완료", msg)
            log(f"인증서 설치 성공: {msg}")
        else:
            messagebox.showwarning("SSL 인증서 설치 알림", msg)
            log(f"인증서 설치 실패/안내: {msg}")

    btn_cert = tk.Button(
        cert_card,
        text="🔒 SSL Root CA 인증서 자동 설치",
        font=("Helvetica", 10, "bold"),
        fg=TEXT_MAIN,
        bg="#334155",
        activebackground="#475569",
        activeforeground=TEXT_MAIN,
        bd=0,
        relief="flat",
        cursor="hand2",
        pady=8,
        command=on_install_cert_click
    )
    btn_cert.pack(fill="x", padx=16, pady=12)

    # Log / Query history frame
    log_frame = tk.Frame(root, bg=BG)
    log_frame.pack(fill="both", expand=True, padx=20, pady=(5, 15))

    stats_lbl = tk.Label(log_frame, text="쿼리 기록 (0 건 처리됨)", font=("Helvetica", 9), fg=TEXT_MUTED, bg=BG)
    stats_lbl.pack(anchor="w", pady=(0, 4))

    log_text = tk.Text(log_frame, bg="#020617", fg="#38bdf8", font=("Courier", 8), bd=0, state="disabled", wrap="none")
    log_text.pack(fill="both", expand=True)

    def log(msg):
        def _append():
            log_text.config(state="normal")
            log_text.insert("end", f"{msg}\n")
            log_text.see("end")
            log_text.config(state="disabled")
        root.after(0, _append)

    def on_query_callback(domain, ms, status):
        def _update():
            if proxy:
                stats_lbl.config(text=f"쿼리 기록 ({proxy.query_count} 건 처리됨)")
            log(f"[{status}] {domain} ({ms}ms)")
        root.after(0, _update)

    def toggle_connection():
        nonlocal is_connected, proxy
        if not is_connected:
            # Start proxy
            target_url = doh_url_var.get().strip() or DEFAULT_DOH_URL
            try:
                proxy = DnsProxyServer(doh_url=target_url, on_query=on_query_callback)
                proxy.start()
            except PermissionError:
                messagebox.showerror(
                    "권한 오류",
                    "포트 53 바인딩에 관리자 권한이 필요합니다.\n프로그램을 관리자(sudo / Administrator) 권한으로 실행해 주세요."
                )
                return
            except Exception as e:
                messagebox.showerror("시작 실패", f"DNS 프록시 시작 오류:\n{e}")
                return

            is_connected = True
            status_icon_lbl.config(text="● PROTECTED", fg=ACCENT_GREEN)
            status_desc_lbl.config(text=f"연결됨: {target_url}")
            btn_toggle.config(text="연결 해제 (DISCONNECT)", bg=ACCENT_RED, activebackground="#dc2626")
            log("=== DNS 프록시 활성화 (127.0.0.1:53) ===")

            if auto_dns_var.get():
                ok, msg = dns_mgr.set_local_dns()
                log(f"시스템 DNS 설정: {msg}")
        else:
            # Stop proxy
            if proxy:
                proxy.stop()
                proxy = None
            if auto_dns_var.get():
                ok, msg = dns_mgr.revert_dns()
                log(f"시스템 DNS 복원: {msg}")

            is_connected = False
            status_icon_lbl.config(text="● DISCONNECTED", fg=ACCENT_RED)
            status_desc_lbl.config(text="DNS 보호가 꺼져 있습니다.")
            btn_toggle.config(text="연결하기 (CONNECT)", bg=ACCENT_BLUE, activebackground="#2563eb")
            log("=== DNS 프록시 중지됨 ===")

    btn_toggle.config(command=toggle_connection)

    def on_closing():
        if is_connected:
            toggle_connection()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_closing)
    root.mainloop()

# ---------------------------------------------------------------------------
# CLI Fallback & Service Mode
# ---------------------------------------------------------------------------

def run_cli(doh_url=DEFAULT_DOH_URL, port=DEFAULT_PORT, auto_dns=True):
    print("=" * 60)
    print(" YuhaDNS Intra Client (CLI Mode)")
    print(f" DoH URL: {doh_url}")
    print(f" Listen : {DEFAULT_HOST}:{port}")
    print("=" * 60)

    dns_mgr = SystemDnsManager()
    def on_query(domain, ms, status):
        print(f"[{time.strftime('%H:%M:%S')}] [{status:<5}] {domain} ({ms}ms)")

    proxy = DnsProxyServer(doh_url=doh_url, port=port, on_query=on_query)
    try:
        proxy.start()
        print(f"[+] 로컬 DNS 프록시 가동 시작 (127.0.0.1:{port})")
    except PermissionError:
        print("[-] 포트 53 바인딩 실패: 관리자 권한(sudo / Administrator)이 필요합니다.")
        return 1
    except Exception as e:
        print(f"[-] 프록시 시작 오류: {e}")
        return 1

    if auto_dns:
        ok, msg = dns_mgr.set_local_dns()
        print(f"[*] 시스템 DNS 설정: {msg}")

    print("[*] 실행 중입니다. 종료하려면 Ctrl+C를 누르세요.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[*] 종료 요청 수신. 정리 중...")
    finally:
        proxy.stop()
        if auto_dns:
            ok, msg = dns_mgr.revert_dns()
            print(f"[*] 시스템 DNS 복원: {msg}")
        print("[+] 정상 종료되었습니다.")
    return 0

def main():
    import argparse
    parser = argparse.ArgumentParser(description="YuhaDNS Intra Desktop Client")
    parser.add_argument("--cli", action="store_true", help="Run in CLI mode without GUI")
    parser.add_argument("--url", default=DEFAULT_DOH_URL, help="DoH Server URL")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Local DNS listening port (default 53)")
    parser.add_argument("--no-system-dns", action="store_true", help="Do not modify system DNS settings")
    parser.add_argument("--install-cert", action="store_true", help="Install SSL Root CA certificate and exit")

    args = parser.parse_args()

    if args.install_cert:
        print("[*] YuhaDNS SSL Root CA 인증서 설치 시작...")
        success, msg = install_root_ca()
        if success:
            print(f"[+] 성공: {msg}")
            return 0
        else:
            print(f"[-] 실패: {msg}")
            return 1

    if args.cli:
        return run_cli(doh_url=args.url, port=args.port, auto_dns=not args.no_system_dns)

    # Attempt to run GUI, fallback to CLI if DISPLAY is not available
    try:
        run_gui()
    except Exception as e:
        if "DISPLAY" in str(e) or "display" in str(e).lower() or not os.environ.get("DISPLAY"):
            print(f"[!] GUI 디스플레이를 초기화할 수 없어 CLI 모드로 전환합니다: {e}")
            return run_cli(doh_url=args.url, port=args.port, auto_dns=not args.no_system_dns)
        raise

if __name__ == "__main__":
    sys.exit(main() or 0)
