package sourceproof;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.cloud.openfeign.FeignClient;

@RestController
class InventoryProxySource {
    private final InventoryProxyClient client;
    InventoryProxySource(InventoryProxyClient client) { this.client = client; }
    @GetMapping("/proxy")
    public String proxy() { return client.items(); }
}
@FeignClient(name = "inventory")
interface InventoryProxyClient {
    @GetMapping("/items")
    String items();
}
