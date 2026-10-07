package demo;

import net.minecraftforge.common.MinecraftForge;

public final class Demo {
  public static void register() {
    MinecraftForge.EVENT_BUS.register(new Demo());
  }
}
