import socket
import unittest
from unittest import mock

from setlog_join import network


class IsPrivateLanTest(unittest.TestCase):
    def test_accepts_home_network_addresses(self):
        for address in ("192.168.1.20", "10.0.0.5", "172.16.3.4"):
            with self.subTest(address=address):
                self.assertTrue(network.is_private_lan(address))

    def test_rejects_global_loopback_and_link_local(self):
        for address in ("133.51.75.153", "8.8.8.8", "127.0.0.1", "169.254.1.1"):
            with self.subTest(address=address):
                self.assertFalse(network.is_private_lan(address))


class ResolveHostTest(unittest.TestCase):
    def test_uses_explicit_host_as_is(self):
        with mock.patch.object(network, "lan_address") as lan_address:
            self.assertEqual(network.resolve_host("127.0.0.1"), "127.0.0.1")
        lan_address.assert_not_called()

    def test_uses_private_lan_address(self):
        with mock.patch.object(network, "lan_address", return_value="192.168.1.20"):
            self.assertEqual(network.resolve_host(None), "192.168.1.20")

    def test_refuses_global_address(self):
        with mock.patch.object(network, "lan_address", return_value="133.51.75.153"):
            with self.assertRaises(network.HostError) as ctx:
                network.resolve_host(None)
        self.assertIn("--host", str(ctx.exception))

    def test_refuses_without_network(self):
        with mock.patch.object(network, "lan_address", return_value=None):
            with self.assertRaises(network.HostError):
                network.resolve_host(None)


class PortAvailableTest(unittest.TestCase):
    def test_detects_port_in_use(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            sock.listen()
            port = sock.getsockname()[1]
            self.assertFalse(network.port_available("127.0.0.1", port))


if __name__ == "__main__":
    unittest.main()
