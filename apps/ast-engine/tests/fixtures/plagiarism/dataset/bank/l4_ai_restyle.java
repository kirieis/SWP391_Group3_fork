import java.util.ArrayList;
import java.util.List;

public class Account {
    private final String holder;
    private double funds;
    private final List<String> log = new ArrayList<>();

    public Account(String holder, double startingFunds) {
        this.holder = holder;
        this.funds = startingFunds;
        log.add("OPEN:" + startingFunds);
    }

    public void putIn(double sum) {
        if (sum > 0) {
            funds = funds + sum;
            log.add("DEPOSIT:" + sum);
        } else {
            throw new IllegalArgumentException("Amount must be positive");
        }
    }

    public boolean takeOut(double sum) {
        if (sum > 0 && sum <= funds) {
            funds = funds - sum;
            log.add("WITHDRAW:" + sum);
            return true;
        }
        return false;
    }

    public boolean sendTo(Account other, double sum) {
        boolean ok = takeOut(sum);
        if (ok) {
            other.putIn(sum);
            log.add("TRANSFER:" + sum + "->" + other.holder);
        }
        return ok;
    }

    public void addInterest(double percent, int span) {
        int year = 0;
        while (year < span) {
            funds = funds + funds * percent / 100;
            year += 1;
        }
        log.add("INTEREST:" + percent);
    }

    public double currentFunds() {
        return funds;
    }

    public void show() {
        System.out.println("Owner: " + holder);
        int n = 0;
        while (n < log.size()) {
            System.out.println(" - " + log.get(n));
            n += 1;
        }
        System.out.println("Balance: " + funds);
    }

    public static void main(String[] args) {
        Account first = new Account("An", 1000);
        Account second = new Account("Binh", 500);
        first.putIn(250);
        first.sendTo(second, 300);
        second.addInterest(5, 2);
        first.show();
        second.show();
    }
}
