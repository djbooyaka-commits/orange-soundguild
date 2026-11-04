import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


class PcCommandsTest(unittest.TestCase):
    def setUp(self):
        self.mouse = MagicMock()
        modules = {"mss": MagicMock(), "pyautogui": self.mouse, "requests": MagicMock(), "PIL": MagicMock()}
        with patch.dict(sys.modules, modules):
            spec = importlib.util.spec_from_file_location("pc_agent", Path(__file__).parents[1] / "public/pc-remote/osg_pc_remote.py")
            self.agent = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.agent)
        self.agent.input_available = lambda: True
        self.mon = {"left": 100, "top": 50, "width": 1920, "height": 1080}

    def command(self, kind, **payload):
        return self.agent.run({"kind": kind, "payload": payload}, self.mon)

    def test_password_never_typed(self):
        self.assertEqual(self.command("unlock", password="dummy-test-only")[0], "failed")
        self.mouse.write.assert_not_called()
        self.mouse.press.assert_not_called()

    def test_secure_screen_blocks_mouse(self):
        self.agent.input_available = lambda: False
        self.assertEqual(self.command("tap", x=5, y=6)[0], "failed")
        self.mouse.click.assert_not_called()

    def test_relative_mouse_moves(self):
        self.mouse.position.return_value = (300, 200)
        self.assertEqual(self.command("mouse_move", dx=40, dy=-20)[0], "done")
        self.mouse.moveTo.assert_called_once_with(340, 180)

    def test_click_buttons(self):
        self.command("mouse_click", button="right")
        self.mouse.click.assert_called_once_with(button="right")
        self.command("mouse_click", button="double")
        self.mouse.doubleClick.assert_called_once_with()

    def test_scroll_is_three_not_360_notches(self):
        self.command("scroll", dy=3)
        self.mouse.scroll.assert_called_once_with(3)

    def test_display_coordinates_use_monitor_offset(self):
        self.command("tap", x=10, y=20)
        self.mouse.click.assert_called_once_with(110, 70)

    def test_drag_releases(self):
        self.command("mouse_hold", down=True)
        self.command("mouse_hold", down=False)
        self.mouse.mouseDown.assert_called_once_with(button="left")
        self.mouse.mouseUp.assert_called_once_with(button="left")

    def test_keep_awake_does_not_change_lock_settings(self):
        dll = MagicMock()
        with patch.object(self.agent.platform, "system", return_value="Windows"), patch("ctypes.windll", dll, create=True):
            self.agent.keep_awake(True)
            self.agent.keep_awake(False)
        self.assertEqual([c.args[0] for c in dll.kernel32.SetThreadExecutionState.call_args_list], [0x80000003, 0x80000000])
        dll.user32.LockWorkStation.assert_not_called()


if __name__ == "__main__":
    unittest.main()