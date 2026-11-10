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

    def test_sleeps_15_seconds_when_not_live(self):
        self.assertEqual(self.agent.poll_delay(False, 999, self.agent.idle_seconds(15000)), 15.0)

    def test_fast_while_live(self):
        self.assertEqual(self.agent.poll_delay(True, 999, 15.0), 0.05)

    def test_stays_responsive_right_after_a_command(self):
        self.assertEqual(self.agent.poll_delay(False, 5, 15.0), 1.0)

    def test_idle_hint_is_clamped(self):
        self.assertEqual(self.agent.idle_seconds(1), 5.0)
        self.assertEqual(self.agent.idle_seconds(999999), 60.0)
        self.assertEqual(self.agent.idle_seconds(None), 15.0)

    def test_idle_release_leaves_real_mouse_alone(self):
        self.agent.release_mouse()
        self.mouse.mouseUp.assert_not_called()

    def test_release_only_after_remote_hold(self):
        self.command("mouse_hold", down=True)
        self.agent.release_mouse()
        self.agent.release_mouse()
        self.mouse.mouseUp.assert_called_once_with(button="left")

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

    def test_update_script_waits_without_timeout_and_reopens(self):
        script = self.agent.update_script(r"C:\OSG\OSG-PC-Remote.exe.new", r"C:\OSG\OSG-PC-Remote.exe")
        self.assertNotIn("timeout", script)
        self.assertIn("ping 127.0.0.1 -n 2", script)
        self.assertIn("if %n% lss 15 goto wait", script)
        self.assertIn(r'start "" /D "C:\OSG" "C:\OSG\OSG-PC-Remote.exe"', script)
        # the app is reopened after the retry loop, even when the swap never succeeded
        self.assertLess(script.index("lss 15"), script.index("start "))

    def test_relaunch_env_drops_old_unpack_folder(self):
        with patch.dict("os.environ", {"_MEIPASS2": "x", "_PYI_APPLICATION_HOME_DIR": "y", "PATH": "p"}):
            env = self.agent.fresh_env()
        self.assertNotIn("_MEIPASS2", env)
        self.assertNotIn("_PYI_APPLICATION_HOME_DIR", env)
        self.assertEqual(env["PYINSTALLER_RESET_ENVIRONMENT"], "1")
        self.assertEqual(env["PATH"], "p")


if __name__ == "__main__":
    unittest.main()