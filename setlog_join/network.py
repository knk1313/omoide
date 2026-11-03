"""サーバーを待ち受けるアドレスを決める。

LAN 内からだけ届くよう、0.0.0.0 ではなく、この Mac の LAN 側のアドレスだけで待ち受ける。
"""

import ipaddress
import socket


class HostError(ValueError):
    """待ち受けるアドレスを決められない。メッセージは利用者向け。"""


def lan_address() -> str | None:
    """外へ出るときに使うインターフェースの IPv4 アドレス。ネットワークが無ければ None。"""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        try:
            # UDP の connect は経路を決めるだけで、パケットは送らない。宛先は文書用のアドレス (TEST-NET-1)
            sock.connect(("192.0.2.1", 9))
        except OSError:
            return None
        return sock.getsockname()[0]


def is_private_lan(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    return ip.is_private and not ip.is_loopback and not ip.is_link_local


def resolve_host(explicit: str | None) -> str:
    """--host の指定が無ければ、LAN のプライベートアドレスを選ぶ。選べなければ HostError。"""
    if explicit is not None:
        return explicit
    address = lan_address()
    if address is None:
        raise HostError("ネットワークに接続していません。Mac を Wi-Fi に接続してください。")
    if not is_private_lan(address):
        raise HostError(
            f"この Mac のアドレス {address} はプライベートアドレスではありません。\n"
            "大学や会社のネットワークでは、同じ Wi-Fi の外からも届くおそれがあるため起動しません。\n"
            "家庭の Wi-Fi に接続するか、待ち受けるアドレスを --host で明示してください。"
        )
    return address


def port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((host, port))
        except OSError:
            return False
        return True
